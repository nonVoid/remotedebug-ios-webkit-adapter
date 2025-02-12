"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOSProtocol = void 0;
const protocol_1 = require("../protocol");
const logger_1 = require("../../logger");
const screencast_1 = require("./screencast");
class IOSProtocol extends protocol_1.ProtocolAdapter {
    constructor(target) {
        super(target);
        this._styleMap = new Map();
        this._target.on("tools::DOM.getDocument", () => this.onDomGetDocument());
        this._target.addMessageFilter("tools::CSS.setStyleTexts", (msg) => this.onSetStyleTexts(msg));
        this._target.addMessageFilter("tools::CSS.getMatchedStylesForNode", (msg) => this.onGetMatchedStylesForNode(msg));
        this._target.addMessageFilter("tools::CSS.getBackgroundColors", (msg) => this.onGetBackgroundColors(msg));
        this._target.addMessageFilter("tools::CSS.addRule", (msg) => this.onAddRule(msg));
        this._target.addMessageFilter("tools::CSS.getPlatformFontsForNode", (msg) => this.onGetPlatformFontsForNode(msg));
        this._target.addMessageFilter("target::CSS.getMatchedStylesForNode", (msg) => this.onGetMatchedStylesForNodeResult(msg));
        this._target.addMessageFilter("tools::Page.startScreencast", (msg) => this.onStartScreencast(msg));
        this._target.addMessageFilter("tools::Page.stopScreencast", (msg) => this.onStopScreencast(msg));
        this._target.addMessageFilter("tools::Page.screencastFrameAck", (msg) => this.onScreencastFrameAck(msg));
        this._target.addMessageFilter("tools::Page.getNavigationHistory", (msg) => this.onGetNavigationHistory(msg));
        this._target.addMessageFilter("tools::Page.setOverlayMessage", (msg) => {
            msg.method = "Debugger.setOverlayMessage";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Page.configureOverlay", (msg) => {
            msg.method = "Debugger.setOverlayMessage";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::DOM.enable", (msg) => this.onDomEnable(msg));
        this._target.addMessageFilter("tools::DOM.setInspectMode", (msg) => this.onSetInspectMode(msg));
        this._target.addMessageFilter("tools::DOM.setInspectedNode", (msg) => {
            msg.method = "Console.addInspectedNode";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::DOM.pushNodesByBackendIdsToFrontend", (msg) => this.onPushNodesByBackendIdsToFrontend(msg));
        this._target.addMessageFilter("tools::DOM.getBoxModel", (msg) => this.onGetBoxModel(msg));
        this._target.addMessageFilter("tools::DOM.getNodeForLocation", (msg) => this.onGetNodeForLocation(msg));
        this._target.addMessageFilter("tools::DOMDebugger.getEventListeners", (msg) => this.DOMDebuggerOnGetEventListeners(msg));
        this._target.addMessageFilter("tools::Debugger.canSetScriptSource", (msg) => this.onCanSetScriptSource(msg));
        this._target.addMessageFilter("tools::Debugger.setBlackboxPatterns", (msg) => this.onSetBlackboxPatterns(msg));
        this._target.addMessageFilter("tools::Debugger.setAsyncCallStackDepth", (msg) => this.onSetAsyncCallStackDepth(msg));
        this._target.addMessageFilter("tools::Debugger.enable", (msg) => this.onDebuggerEnable(msg));
        this._target.addMessageFilter("target::Debugger.scriptParsed", (msg) => this.onScriptParsed(msg));
        this._target.addMessageFilter("tools::Emulation.canEmulate", (msg) => this.onCanEmulate(msg));
        this._target.addMessageFilter("tools::Emulation.setTouchEmulationEnabled", (msg) => {
            msg.method = "Page.setTouchEmulationEnabled";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Emulation.setScriptExecutionDisabled", (msg) => {
            msg.method = "Page.setScriptExecutionDisabled";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Emulation.setEmulatedMedia", (msg) => {
            msg.method = "Page.setEmulatedMedia";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Rendering.setShowPaintRects", (msg) => {
            msg.method = "Page.setShowPaintRects";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Input.emulateTouchFromMouseEvent", (msg) => this.onEmulateTouchFromMouseEvent(msg));
        this._target.addMessageFilter("tools::Log.clear", (msg) => {
            msg.method = "Console.clearMessages";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Log.disable", (msg) => {
            msg.method = "Console.disable";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Log.enable", (msg) => {
            msg.method = "Console.enable";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("target::Console.messageAdded", (msg) => this.onConsoleMessageAdded(msg));
        this._target.addMessageFilter("tools::Network.getCookies", (msg) => {
            msg.method = "Page.getCookies";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Network.deleteCookie", (msg) => {
            msg.method = "Page.deleteCookie";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Network.setMonitoringXHREnabled", (msg) => {
            msg.method = "Console.setMonitoringXHREnabled";
            return Promise.resolve(msg);
        });
        this._target.addMessageFilter("tools::Network.canEmulateNetworkConditions", (msg) => this.onCanEmulateNetworkConditions(msg));
        this._target.addMessageFilter("tools::Runtime.compileScript", (msg) => this.onRuntimeOnCompileScript(msg));
        this._target.addMessageFilter("target::Runtime.executionContextCreated", (msg) => this.onExecutionContextCreated(msg));
        this._target.addMessageFilter("target::Runtime.evaluate", (msg) => this.onEvaluate(msg));
        this._target.addMessageFilter("target::Runtime.getProperties", (msg) => this.onRuntimeGetProperties(msg));
        this._target.addMessageFilter("target::Inspector.inspect", (msg) => this.onInspect(msg));
    }
    onDomGetDocument() {
        // Rundown the stylesheets when the page navigates
        this.enumerateStyleSheets();
    }
    onSetStyleTexts(msg) {
        const resultId = msg.id;
        const promises = [];
        // Convert all the requests into individual calls to setStyleText
        for (let i = 0; i < msg.params.edits.length; i++) {
            const edit = msg.params.edits[i];
            const paramsGetStyleSheet = {
                styleSheetId: edit.styleSheetId,
            };
            // iOS uses ordinals to map CSSRules to a location in the document. Chromium uses ranges.
            // Fortunately, if we get the style sheet, we can with minimal effort find the existing range that matches the Chromium edit range and return that ordinal in the rules listen
            // We make the assumption that a rule location can only match once and return the first instance.
            const setStyleText = this._target
                .callTarget("CSS.getStyleSheet", paramsGetStyleSheet)
                .then((result) => {
                if (!result.styleSheet || !result.styleSheet.rules) {
                    logger_1.Logger.error("iOS returned a value we were not expecting for getStyleSheet");
                    return Promise.resolve(null);
                }
                const length = result.styleSheet.rules.length;
                for (let ordinal = 0; ordinal < length; ordinal++) {
                    let rule = result.styleSheet.rules[ordinal];
                    if (this.compareRanges(rule.style.range, edit.range)) {
                        const params = {
                            styleId: {
                                styleSheetId: edit.styleSheetId,
                                ordinal: ordinal,
                            },
                            text: edit.text,
                        };
                        return this._target
                            .callTarget("CSS.setStyleText", params)
                            .then((setStyleResult) => {
                            this.mapStyle(setStyleResult.style, "");
                            return setStyleResult.style;
                        });
                    }
                }
            });
            promises.push(setStyleText);
        }
        // Combine all the setStyleText calls into a single result
        Promise.all(promises).then((allResults) => {
            const result = {
                styles: allResults,
            };
            this._target.fireResultToTools(resultId, result);
        });
        // Resolve the original promise with null to prevent 'setStyleTexts' from going to the target
        return Promise.resolve(null);
    }
    // Called on a Chrome range and an iOS range
    compareRanges(rangeLeft, rangeRight) {
        return (rangeLeft.startLine === rangeRight.startLine &&
            rangeLeft.endLine === rangeRight.endLine &&
            rangeLeft.startColumn === rangeRight.startColumn &&
            rangeLeft.endColumn === rangeRight.endColumn);
    }
    onGetMatchedStylesForNode(msg) {
        // Store the last selected nodeId so we can add new rules to this node
        this._lastNodeId = msg.params.nodeId;
        return Promise.resolve(msg);
    }
    onCanEmulate(msg) {
        const result = {
            result: true,
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onGetPlatformFontsForNode(msg) {
        const result = {
            fonts: [],
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onGetBackgroundColors(msg) {
        const result = {
            backgroundColors: [],
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onAddRule(msg) {
        // Convert the chrome new rule into an ios rule on the current node
        const selector = msg.params.ruleText.trim().replace("{}", "");
        const params = {
            contextNodeId: this._lastNodeId,
            selector: selector,
        };
        this._target.callTarget("CSS.addRule", params).then((result) => {
            this.mapRule(result.rule);
            this._target.fireResultToTools(msg.id, result);
        });
        return Promise.resolve(null);
    }
    onCanSetScriptSource(msg) {
        const result = {
            result: false,
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onSetBlackboxPatterns(msg) {
        const result = {};
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onSetAsyncCallStackDepth(msg) {
        const result = {
            result: true,
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onDebuggerEnable(msg) {
        this._target.callTarget("Debugger.setBreakpointsActive", {
            active: true,
        });
        return Promise.resolve(msg);
    }
    onGetMatchedStylesForNodeResult(msg) {
        const result = msg.result;
        if (result) {
            // Convert all the rules into the chrome format
            for (let i in result.matchedCSSRules) {
                if (result.matchedCSSRules[i].rule) {
                    this.mapRule(result.matchedCSSRules[i].rule);
                }
            }
            for (let i in result.inherited) {
                if (result.inherited[i].matchedCSSRules) {
                    for (let j in result.inherited[i].matchedCSSRules) {
                        if (result.inherited[i].matchedCSSRules[j].rule) {
                            this.mapRule(result.inherited[i].matchedCSSRules[j].rule);
                        }
                    }
                }
            }
        }
        return Promise.resolve(msg);
    }
    onExecutionContextCreated(msg) {
        if (msg.params && msg.params.context) {
            if (!msg.params.context.origin) {
                msg.params.context.origin = msg.params.context.name;
            }
            if (msg.params.context.isPageContext) {
                this._lastPageExecutionContextId = msg.params.context.id;
            }
            if (msg.params.context.frameId) {
                msg.params.context.auxData = {
                    frameId: msg.params.context.frameId,
                    isDefault: true,
                };
                delete msg.params.context.frameId;
            }
        }
        return Promise.resolve(msg);
    }
    onEvaluate(msg) {
        if (msg.result && msg.result.wasThrown) {
            msg.result.result.subtype = "error";
            msg.result.exceptionDetails = {
                text: msg.result.result.description,
                url: "",
                scriptId: this._lastScriptEval,
                line: 1,
                column: 0,
                stack: {
                    callFrames: [
                        {
                            functionName: "",
                            scriptId: this._lastScriptEval,
                            url: "",
                            lineNumber: 1,
                            columnNumber: 1,
                        },
                    ],
                },
            };
        }
        else if (msg.result &&
            msg.result.result &&
            msg.result.result.preview) {
            msg.result.result.preview.description =
                msg.result.result.description;
            msg.result.result.preview.type = "object";
        }
        return Promise.resolve(msg);
    }
    onRuntimeOnCompileScript(msg) {
        const params = {
            expression: msg.params.expression,
            contextId: msg.params.executionContextId,
        };
        this._target.callTarget("Runtime.evaluate", params).then((obj) => {
            const results = {
                scriptId: null,
                exceptionDetails: null,
            };
            this._target.fireResultToTools(msg.id, results);
        });
        return Promise.resolve(null);
    }
    onRuntimeGetProperties(msg) {
        const newPropertyDescriptors = [];
        logger_1.debug("messages", msg);
        if (msg.result.result) {
            for (let i = 0; i < msg.result.result.length; i++) {
                if (msg.result.result[i].isOwn ||
                    msg.result.result[i].nativeGetter) {
                    msg.result.result[i].isOwn = true;
                    newPropertyDescriptors.push(msg.result.result[i]);
                }
            }
            msg.result.result = null;
        }
        else {
            // iOS13+ msg.result.result rename msg.result.properties
            for (let i = 0; i < msg.result.properties.length; i++) {
                if (msg.result.properties[i].isOwn ||
                    msg.result.properties[i].nativeGetter) {
                    msg.result.properties[i].isOwn = true;
                    newPropertyDescriptors.push(msg.result.properties[i]);
                }
            }
            msg.result.properties = null;
        }
        return Promise.resolve(msg);
    }
    onScriptParsed(msg) {
        this._lastScriptEval = msg.params.scriptId;
        return Promise.resolve(msg);
    }
    onDomEnable(msg) {
        this._target.fireResultToTools(msg.id, {});
        return Promise.resolve(null);
    }
    onSetInspectMode(msg) {
        msg.method = "DOM.setInspectModeEnabled";
        msg.params.enabled = msg.params.mode === "searchForNode";
        delete msg.params.mode;
        return Promise.resolve(msg);
    }
    onInspect(msg) {
        msg.method = "DOM.inspectNodeRequested";
        msg.params.backendNodeId = msg.params.object.objectId;
        delete msg.params.object;
        delete msg.params.hints;
        return Promise.resolve(msg);
    }
    DOMDebuggerOnGetEventListeners(msg) {
        const requestNodeParams = {
            objectId: msg.params.objectId,
        };
        this._target
            .callTarget("DOM.requestNode", requestNodeParams)
            .then((result) => {
            const getEventListenersForNodeParams = {
                nodeId: result.nodeId,
                objectGroup: "event-listeners-panel",
            };
            return this._target.callTarget("DOM.getEventListenersForNode", getEventListenersForNodeParams);
        })
            .then((result) => {
            const mappedListeners = result.listeners.map((listener) => {
                return {
                    type: listener.type,
                    useCapture: listener.useCapture,
                    passive: false,
                    location: listener.location,
                    hander: listener.hander,
                };
            });
            const mappedResult = {
                listeners: mappedListeners,
            };
            this._target.fireResultToTools(msg.id, mappedResult);
        });
        return Promise.resolve(null);
    }
    onPushNodesByBackendIdsToFrontend(msg) {
        const resultId = msg.id;
        const promises = [];
        // Convert all the requests into individual calls to pushNodeByBackendIdToFrontend
        for (let i = 0; i < msg.params.backendNodeIds.length; i++) {
            let params = {
                backendNodeId: msg.params.backendNodeIds[i],
            };
            const pushNode = this._target
                .callTarget("DOM.pushNodeByBackendIdToFrontend", params)
                .then((result) => {
                return result.nodeId;
            });
            promises.push(pushNode);
        }
        // Combine all the pushNodeByBackendIdToFrontend calls into a single result
        Promise.all(promises).then((allResults) => {
            const result = {
                nodeIds: allResults,
            };
            this._target.fireResultToTools(resultId, result);
        });
        // Resolve the original promise with null to prevent 'setStyleTexts' from going to the target
        return Promise.resolve(null);
    }
    onGetBoxModel(msg) {
        const params = {
            highlightConfig: {
                showInfo: true,
                showRulers: false,
                showExtensionLines: false,
                contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
                paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
                borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
                marginColor: { r: 246, g: 178, b: 107, a: 0.66 },
                eventTargetColor: { r: 255, g: 196, b: 196, a: 0.66 },
                shapeColor: { r: 96, g: 82, b: 177, a: 0.8 },
                shapeMarginColor: { r: 96, g: 82, b: 127, a: 0.6 },
                displayAsMaterial: true,
            },
            nodeId: msg.params.nodeId,
        };
        this._target.callTarget("DOM.highlightNode", params);
        return Promise.resolve(null);
    }
    onGetNodeForLocation(msg) {
        this._target
            .callTarget("Runtime.evaluate", {
            expression: "document.elementFromPoint(" +
                msg.params.x +
                "," +
                msg.params.y +
                ")",
        })
            .then((obj) => {
            this._target
                .callTarget("DOM.requestNode", {
                objectId: obj.result.objectId,
            })
                .then((result) => {
                this._target.fireResultToTools(msg.id, {
                    nodeId: result.nodeId,
                });
            });
        });
        return Promise.resolve(null);
    }
    onStartScreencast(msg) {
        const format = msg.params.format;
        const quality = msg.params.quality;
        const maxWidth = msg.params.maxWidth;
        const maxHeight = msg.params.maxHeight;
        if (this._screencastSession) {
            // Session has already started so dispose of the current one
            this._screencastSession.dispose();
        }
        this._screencastSession = new screencast_1.ScreencastSession(this._target, format, quality, maxWidth, maxHeight);
        this._screencastSession.start();
        this._target.fireResultToTools(msg.id, {});
        return Promise.resolve(null);
    }
    onStopScreencast(msg) {
        if (this._screencastSession) {
            this._screencastSession.stop();
            this._screencastSession = null;
        }
        this._target.fireResultToTools(msg.id, {});
        return Promise.resolve(null);
    }
    onScreencastFrameAck(msg) {
        if (this._screencastSession) {
            const frameNumber = msg.params.sessionId;
            this._screencastSession.ackFrame(frameNumber);
        }
        this._target.fireResultToTools(msg.id, {});
        return Promise.resolve(null);
    }
    onGetNavigationHistory(msg) {
        let href = "";
        this._target
            .callTarget("Runtime.evaluate", {
            expression: "window.location.href",
        })
            .then((result) => {
            href = result.result.value;
            return this._target.callTarget("Runtime.evaluate", {
                expression: "window.title",
            });
        })
            .then((result) => {
            const title = result.result.value;
            this._target.fireResultToTools(msg.id, {
                currentIndex: 0,
                entries: [{ id: 0, url: href, title: title }],
            });
        });
        return Promise.resolve(null);
    }
    onEmulateTouchFromMouseEvent(msg) {
        /* tslint:disable */
        function simulate(params) {
            const element = document.elementFromPoint(params.x, params.y);
            const e = new MouseEvent(params.type, {
                screenX: params.x,
                screenY: params.y,
                clientX: 0,
                clientY: 0,
                ctrlKey: (params.modifiers & 2) === 2,
                shiftKey: (params.modifiers & 8) === 8,
                altKey: (params.modifiers & 1) === 1,
                metaKey: (params.modifiers & 4) === 4,
                button: params.button,
                bubbles: true,
                cancelable: false,
            });
            element.dispatchEvent(e);
            return element;
        }
        /* tslint:enable */
        switch (msg.params.type) {
            case "mousePressed":
                msg.params.type = "mousedown";
                break;
            case "mouseReleased":
                msg.params.type = "click";
                break;
            case "mouseMoved":
                msg.params.type = "mousemove";
                break;
            default:
                logger_1.Logger.error(`Unknown emulate mouse event name '${msg.params.type}'`);
                break;
        }
        const exp = `(${simulate.toString()})(${JSON.stringify(msg.params)})`;
        this._target
            .callTarget("Runtime.evaluate", { expression: exp })
            .then((result) => {
            if (msg.params.type === "click") {
                msg.params.type = "mouseup";
                this._target.callTarget("Runtime.evaluate", {
                    expression: exp,
                });
            }
        });
        return this._target.replyWithEmpty(msg);
    }
    onCanEmulateNetworkConditions(msg) {
        const result = {
            result: false,
        };
        this._target.fireResultToTools(msg.id, result);
        return Promise.resolve(null);
    }
    onConsoleMessageAdded(msg) {
        let message = msg.params.message;
        let type;
        if (message.type === "log") {
            switch (message.level) {
                case "log":
                    type = "log";
                    break;
                case "info":
                    type = "info";
                    break;
                case "error":
                    type = "error";
                    break;
                default:
                    type = "log";
            }
        }
        else {
            type = message.type;
        }
        const consoleMessage = {
            source: message.source,
            level: type,
            text: message.text,
            lineNumber: message.line,
            timestamp: new Date().getTime(),
            url: message.url,
            stackTrace: message.stackTrace
                ? {
                    callFrames: message.stackTrace,
                }
                : undefined,
            networkRequestId: message.networkRequestId,
        };
        this._target.fireEventToTools("Log.entryAdded", {
            entry: consoleMessage,
        });
        return Promise.resolve(null);
    }
    enumerateStyleSheets() {
        this._target.callTarget("CSS.getAllStyleSheets", {}).then((msg) => {
            if (msg.headers) {
                for (let header of msg.headers) {
                    header.isInline = false;
                    header.startLine = 0;
                    header.startColumn = 0;
                    this._target.fireEventToTools("CSS.styleSheetAdded", {
                        header: header,
                    });
                }
            }
        });
    }
    mapSelectorList(selectorList) {
        // Each iOS version needs to map this differently
    }
    mapRule(cssRule) {
        var _a;
        if ("ruleId" in cssRule) {
            cssRule.styleSheetId = (_a = cssRule.ruleId) === null || _a === void 0 ? void 0 : _a.styleSheetId;
            delete cssRule.ruleId;
        }
        this.mapSelectorList(cssRule.selectorList);
        this.mapStyle(cssRule.style, cssRule.origin);
        delete cssRule.sourceLine;
    }
    mapStyle(cssStyle, ruleOrigin) {
        var _a;
        if (cssStyle.cssText) {
            const disabled = IOSProtocol.extractDisabledStyles(cssStyle.cssText, cssStyle.range);
            for (let i = 0; i < disabled.length; i++) {
                const text = disabled[i].content
                    .trim()
                    .replace(/^\/\*\s*/, "")
                    .replace(/;\s*\*\/$/, "");
                const parts = text.split(":");
                if (cssStyle.cssProperties) {
                    let index = cssStyle.cssProperties.length;
                    for (let j = 0; j < cssStyle.cssProperties.length; j++) {
                        if (cssStyle.cssProperties[j].range &&
                            (cssStyle.cssProperties[j].range.startLine >
                                disabled[i].range.startLine ||
                                (cssStyle.cssProperties[j].range.startLine ===
                                    disabled[i].range.startLine &&
                                    cssStyle.cssProperties[j].range
                                        .startColumn >
                                        disabled[i].range.startColumn))) {
                            index = j;
                            break;
                        }
                    }
                    cssStyle.cssProperties.splice(index, 0, {
                        implicit: false,
                        name: parts[0],
                        range: disabled[i].range,
                        status: "disabled",
                        text: disabled[i].content,
                        value: parts[1],
                    });
                }
            }
        }
        for (let cssProperty of cssStyle.cssProperties) {
            this.mapCssProperty(cssProperty);
        }
        if (ruleOrigin !== "user-agent") {
            cssStyle.styleSheetId = (_a = cssStyle.styleId) === null || _a === void 0 ? void 0 : _a.styleSheetId;
            const styleKey = `${cssStyle.styleSheetId}_${JSON.stringify(cssStyle.range)}`;
            this._styleMap.set(styleKey, cssStyle.styleId);
        }
        delete cssStyle.styleId;
        delete cssStyle.sourceLine;
        delete cssStyle.sourceURL;
        delete cssStyle.width;
        delete cssStyle.height;
    }
    mapCssProperty(cssProperty) {
        if (cssProperty.status === "disabled") {
            cssProperty.disabled = true;
        }
        else if (cssProperty.status === "active") {
            cssProperty.disabled = false;
        }
        delete cssProperty.status;
        cssProperty.important = !!cssProperty.priority;
        delete cssProperty.priority;
    }
    /**
     * Converts a given index to line and column, offset from a given range otherwise from 0.
     * @returns Line column converted from the given index and offset start range.
     */
    static getLineColumnFromIndex(text, index, startRange) {
        if (text === null ||
            typeof text === "undefined" ||
            index < 0 ||
            index > text.length) {
            return null;
        }
        let line = startRange ? startRange.startLine : 0;
        let column = startRange ? startRange.startColumn : 0;
        for (let i = 0, length = text.length; i < length && i < index; i++) {
            if (text[i] === "\r" &&
                i + 1 < text.length &&
                text[i + 1] === "\n") {
                i++;
                line++;
                column = 0;
            }
            else if (text[i] === "\n" || text[i] === "\r") {
                line++;
                column = 0;
            }
            else {
                column++;
            }
        }
        return { line: line, column: column };
    }
    /**
     * Extract a sequence of texts with ranges corresponding to block comments in the CSS.
     * The texts may or may not contain CSS properties.
     * @returns An array of the disabled styles
     */
    static extractDisabledStyles(styleText, range) {
        const startIndices = [];
        const styles = [];
        for (let index = 0, length = styleText.length; index < length; index++) {
            if (styleText.substr(index, IOSProtocol.BEGIN_COMMENT.length) ===
                IOSProtocol.BEGIN_COMMENT) {
                startIndices.push(index);
                index = index + IOSProtocol.BEGIN_COMMENT.length - 1;
            }
            else if (styleText.substr(index, IOSProtocol.END_COMMENT.length) ===
                IOSProtocol.END_COMMENT) {
                if (startIndices.length === 0) {
                    // Invalid state
                    return [];
                }
                const startIndex = startIndices.pop();
                const endIndex = index + IOSProtocol.END_COMMENT.length;
                const startRange = IOSProtocol.getLineColumnFromIndex(styleText, startIndex !== null && startIndex !== void 0 ? startIndex : 0, range);
                const endRange = IOSProtocol.getLineColumnFromIndex(styleText, endIndex, range);
                const propertyItem = {
                    content: styleText.substring(startIndex !== null && startIndex !== void 0 ? startIndex : 0, endIndex),
                    range: {
                        startLine: (startRange === null || startRange === void 0 ? void 0 : startRange.line) || 0,
                        startColumn: (startRange === null || startRange === void 0 ? void 0 : startRange.column) || 0,
                        endLine: (endRange === null || endRange === void 0 ? void 0 : endRange.line) || 0,
                        endColumn: (endRange === null || endRange === void 0 ? void 0 : endRange.column) || 0,
                    },
                };
                styles.push(propertyItem);
                index = endIndex - 1;
            }
        }
        if (startIndices.length !== 0) {
            // Invalid state
            return [];
        }
        return styles;
    }
}
exports.IOSProtocol = IOSProtocol;
IOSProtocol.BEGIN_COMMENT = "/* ";
IOSProtocol.END_COMMENT = " */";
IOSProtocol.SEPARATOR = ": ";
