"use strict";
//
// Copyright (C) Microsoft. All rights reserved.
//
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterCollection = void 0;
const adapter_1 = require("./adapter");
const logger_1 = require("../logger");
class AdapterCollection extends adapter_1.Adapter {
    constructor(id, proxyUrl, options) {
        super(id, proxyUrl, options);
        this._adapters = new Map();
    }
    start() {
        logger_1.debug(`adapterCollection.start`, this._adapters);
        const startPromises = [super.start()];
        this._adapters.forEach((adapter) => {
            startPromises.push(adapter.start());
        });
        return Promise.all(startPromises);
    }
    stop() {
        logger_1.debug(`adapterCollection.stop`);
        super.stop();
        this._adapters.forEach((adapter) => {
            adapter.stop();
        });
    }
    forceRefresh() {
        logger_1.debug(`adapterCollection.forceRefresh`);
        super.forceRefresh();
        this._adapters.forEach((adapter) => {
            adapter.forceRefresh();
        });
    }
    getTargets(metadata) {
        return new Promise((resolve, reject) => {
            const promises = [];
            let index = 0;
            this._adapters.forEach((adapter) => {
                let targetMetadata = null;
                if (metadata) {
                    targetMetadata =
                        metadata.constructor === Array
                            ? metadata[index]
                            : metadata;
                }
                promises.push(adapter.getTargets(targetMetadata));
                index++;
            });
            Promise.all(promises).then((results) => {
                let allTargets = [];
                results.forEach((targets) => {
                    allTargets = allTargets.concat(targets);
                });
                resolve(allTargets);
            });
        });
    }
    connectTo(url, wsFrom) {
        var _a, _b;
        logger_1.debug(`adapterCollection.connectTo, url=${url}`);
        const id = this.getWebSocketId(url);
        let target;
        if (this._adapters.has(id.adapterId)) {
            target = (_b = (_a = this._adapters) === null || _a === void 0 ? void 0 : _a.get(id.adapterId)) === null || _b === void 0 ? void 0 : _b.connectTo(id.targetId, wsFrom);
        }
        return target;
    }
    forwardTo(url, message) {
        var _a;
        logger_1.debug(`adapterCollection.forwardTo, url=${url}`);
        const id = this.getWebSocketId(url);
        if (this._adapters.has(id.adapterId)) {
            (_a = this._adapters.get(id.adapterId)) === null || _a === void 0 ? void 0 : _a.forwardTo(id.targetId, message);
        }
    }
    getWebSocketId(url) {
        logger_1.debug(`adapterCollection.getWebSocketId, url=${url}`);
        const index = url.indexOf("/", 1);
        const adapterId = url.substr(0, index);
        const targetId = url.substr(index + 1);
        return { adapterId: adapterId, targetId: targetId };
    }
}
exports.AdapterCollection = AdapterCollection;
