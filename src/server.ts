//
// Copyright (C) Microsoft. All rights reserved.
//

import * as http from "http";
import * as express from "express";
import * as ws from "ws";
import { Server as WebSocketServer } from "ws";
import { EventEmitter } from "events";

import { Adapter } from "./adapters/adapter";
import { IOSAdapter } from "./adapters/iosAdapter";
import { IIOSProxySettings } from "./adapters/adapterInterfaces";
import { AddressInfo } from "net";
import * as debug from "debug";
// import { TestAdapter } from './adapters/testAdapter';

export class ProxyServer extends EventEmitter {
    private _hs: http.Server | undefined | null;
    private _es: express.Application | undefined;
    private _wss: WebSocketServer | undefined;
    private _serverPort: number | undefined;
    private _serverHost: string | undefined;
    private _adapter: Adapter | undefined;
    private _targetFetcherInterval: NodeJS.Timer | undefined;

    constructor() {
        super();
    }

    public async run(
        serverPort: number,
        serverHost?: string,
        frontendUrl?: string
    ): Promise<{ port: number; host: string; frontendUrl?: string }> {
        this._serverPort = serverPort;
        const host = serverHost ?? "localhost";
        this._serverHost = host;

        debug("server.run")(serverPort, this._serverHost, frontendUrl);

        this._es = express();
        this._hs = http.createServer(this._es);
        this._wss = new WebSocketServer({
            server: this._hs,
        });
        this._wss.on("connection", (a, req) => this.onWSSConnection(a, req));

        this.setupHttpHandlers();

        // Start server and return the port number
        this._hs.listen(this._serverPort);
        const port = (<AddressInfo>this._hs.address()).port;

        const settings = await IOSAdapter.getProxySettings({
            proxyPort: port + 100,
            proxyHost: host,
        });

        this._adapter = new IOSAdapter(
            `/ios`,
            `ws://${host}:${port}`,
            <IIOSProxySettings>settings,
            frontendUrl
        );

        return this._adapter
            .start()
            .then(() => {
                this.startTargetFetcher();
            })
            .then(() => {
                return { port, host, frontendUrl };
            });
    }

    public stop(): void {
        debug("server.stop");

        if (this._hs) {
            this._hs.close();
            this._hs = null;
        }

        this.stopTargetFetcher();
        this._adapter?.stop();
    }

    public getAdapter(): Adapter | undefined {
        return this._adapter;
    }

    private startTargetFetcher(): void {
        debug("server.startTargetFetcher");

        let fetch = () => {
            this._adapter?.getTargets().then(
                (targets) => {
                    debug(`server.startTargetFetcher.fetched`)(targets.length);
                },
                (err) => {
                    debug(`server.startTargetFetcher.error`)(err);
                }
            );
        };

        this._targetFetcherInterval = setInterval(fetch, 5000);
    }

    private stopTargetFetcher(): void {
        debug("server.stopTargetFetcher");
        if (!this._targetFetcherInterval) {
            return;
        }
        clearInterval(this._targetFetcherInterval);
    }

    private setupHttpHandlers(): void {
        debug("server.setupHttpHandlers");

        this._es?.get("/", (req, res) => {
            debug("server.http.endpoint/");
            res.json({
                msg: "Hello from RemoteDebug iOS WebKit Adapter",
            });
        });

        this._es?.get("/refresh", (req, res) => {
            this._adapter?.forceRefresh();
            this.emit("forceRefresh");
            res.json({
                status: "ok",
            });
        });

        this._es?.get("/json", (req, res) => {
            debug("server.http.endpoint/json");
            this._adapter?.getTargets().then((targets) => {
                res.json(targets);
            });
        });

        this._es?.get("/json/list", (req, res) => {
            debug("server.http.endpoint/json/list");
            this._adapter?.getTargets().then((targets) => {
                res.json(targets);
            });
        });

        this._es?.get("/json/version", (req, res) => {
            debug("server.http.endpoint/json/version");
            res.json({
                Browser: "Safari/RemoteDebug iOS Webkit Adapter",
                "Protocol-Version": "1.2",
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2926.0 Safari/537.36",
                "WebKit-Version":
                    "537.36 (@da59d418f54604ba2451cd0ef3a9cd42c05ca530)",
            });
        });

        this._es?.get("/json/protocol", (req, res) => {
            debug("server.http.endpoint/json/protocol");
            res.json();
        });
    }

    private onWSSConnection(websocket: ws, req: http.IncomingMessage): void {
        const url = req.url;

        debug("server.ws.onWSSConnection")(url);

        let connection = <EventEmitter>websocket;

        try {
            url && this._adapter?.connectTo(url, websocket);
        } catch (err) {
            debug(`server.onWSSConnection`)(err);
        }

        connection.on("message", (msg) => {
            url && this._adapter?.forwardTo(url, msg);
        });
    }
}
