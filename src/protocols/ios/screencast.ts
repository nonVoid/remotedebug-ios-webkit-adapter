//
// Copyright (C) Microsoft. All rights reserved.
//

import debug = require("debug");
import { Target } from "../target";

export class ScreencastSession {
    private _target: Target;
    private _frameId: number;
    private _framesAcked: boolean[];
    private _frameInterval: number = 250; // 60 fps is 16ms
    private _format: string;
    private _quality: number;
    private _maxWidth: number;
    private _maxHeight: number;
    private _timerCookie: any;
    private _deviceWidth: number | undefined;
    private _deviceHeight: number | undefined;
    private _offsetTop: number | undefined;
    private _pageScaleFactor: number | undefined;
    private _scrollOffsetX: number | undefined;
    private _scrollOffsetY: number | undefined;

    constructor(
        target: Target,
        format?: string,
        quality?: number,
        maxWidth?: number,
        maxHeight?: number
    ) {
        this._frameId = 0;
        this._framesAcked = [];
        this._target = target;
        this._format = format || "jpg";
        this._quality = quality || 100;
        this._maxHeight = maxHeight || 1024;
        this._maxWidth = maxWidth || 1024;
    }

    public dispose(): void {
        this.stop();
    }

    public start(): void {
        this._framesAcked = new Array();
        this._frameId = 1; // CDT seems to be 1 based and won't ack when 0

        this._target
            .callTarget("Runtime.evaluate", {
                expression:
                    '(window.innerWidth > 0 ? window.innerWidth : screen.width) + "," + (window.innerHeight > 0 ? window.innerHeight : screen.height) + "," + window.devicePixelRatio',
            })
            .then((msg) => {
                debug("device")(JSON.stringify(msg));
                const parts = msg.result.value.split(",");
                this._deviceWidth = parseInt(parts[0], 10);
                this._deviceHeight = parseInt(parts[1], 10);
                this._pageScaleFactor = parseInt(parts[2], 10);

                this._timerCookie = setInterval(
                    () => this.recordingLoop(),
                    this._frameInterval
                );
            });
    }

    public stop(): void {
        clearInterval(this._timerCookie);
    }

    public ackFrame(frameNumber: number): void {
        this._framesAcked[frameNumber] = true;
    }

    private recordingLoop(): void {
        const currentFrame = this._frameId;
        if (
            currentFrame &&
            currentFrame > 1 &&
            !this._framesAcked[currentFrame - 1]
        ) {
            return;
        }

        this._frameId++;

        this._target
            .callTarget("Runtime.evaluate", {
                expression:
                    'window.document.body.offsetTop + "," + window.pageXOffset + "," + window.pageYOffset',
            })
            .then((msg) => {
                if (msg.wasThrown) {
                    return Promise.reject("");
                }
                const parts = msg.result.value.split(",");
                this._offsetTop = parseInt(parts[0], 10);
                this._scrollOffsetX = parseInt(parts[1], 10);
                this._scrollOffsetY = parseInt(parts[2], 10);
                return Promise.resolve();
            })
            .then(
                () => {
                    this._target
                        .callTarget("Page.snapshotRect", {
                            x: 0,
                            y: 0,
                            width: this._deviceWidth,
                            height: this._deviceHeight,
                            coordinateSystem: "Viewport",
                        })
                        .then((msg) => {
                            const index = msg.dataURL.indexOf("base64,");

                            const frame = {
                                data: msg.dataURL.substr(index + 7),
                                metadata: {
                                    pageScaleFactor: this._pageScaleFactor,
                                    offsetTop: this._offsetTop,
                                    deviceWidth: this._deviceWidth,
                                    deviceHeight: this._deviceHeight,
                                    scrollOffsetX: this._scrollOffsetX,
                                    scrollOffsetY: this._scrollOffsetY,
                                    timestamp: new Date(),
                                },
                                sessionId: currentFrame,
                            };
                            this._target.fireEventToTools(
                                "Page.screencastFrame",
                                frame
                            );
                        });
                },
                () => {
                    // Do nothing
                }
            );
    }
}
