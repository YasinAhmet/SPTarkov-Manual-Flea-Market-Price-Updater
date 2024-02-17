"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (error) {
        console.error("Error reading file:", error);
        return '';
    }
}
function getJsonFilesInfoInFolder(folderPath) {
    const files = fs.readdirSync(folderPath);
    const jsonFiles = files.filter(file => path_1.default.extname(file).toLowerCase() === '.json');
    return jsonFiles.map(file => ({
        path: path_1.default.join(folderPath, file),
        name: file
    }));
}
async function getData(url) {
    try {
        const response = await axios_1.default.get(url);
        return response.data.data.itemsByType;
    }
    catch (error) {
        console.error("Failed to establish connection with Tarkov.Dev database", error);
        return [];
    }
}
function parseJSON(jsonData) {
    try {
        const parsedData = JSON.parse(jsonData);
        const itemsByType = parsedData.data.itemsByType;
        return itemsByType.map((item) => ({
            id: item.id,
            name: item.name,
            avg24hPrice: item.avg24hPrice
        }));
    }
    catch (error) {
        console.error("PLEASE SEND THIS ERROR TO MOD OWNER - Error parsing JSON data:", error);
        return [];
    }
}
class mod {
    static container;
    static logger;
    static updated = false;
    static modname = "YKFLEA:";
    static errorthrowed = false;
    static databaseServer;
    static ragfairPriceService;
    static ragfairOfferGenerator;
    postDBLoad(container) {
        mod.logger = container.resolve("WinstonLogger");
        mod.container = container;
        mod.databaseServer = mod.container.resolve("DatabaseServer");
        mod.ragfairOfferGenerator = container.resolve("RagfairOfferGenerator");
        mod.ragfairPriceService = container.resolve("RagfairPriceService");
        mod.GetAPIPrices();
    }
    static UpdatePricesByItemsArray(priceTable, jsonName, items) {
        this.logger.success(this.modname + "Price pack being added to database: " + jsonName);
        var updatedAmount = 0;
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            //if (this.priceTable == null) continue;
            if (item == null || item.id == null || priceTable[items[index].id] == null)
                continue;
            if (item && priceTable[item.id]) {
                priceTable[item.id] = item.avg24hPrice;
                updatedAmount++;
            }
        }
        if (items.length > 1)
            mod.logger.success(this.modname + "  " + updatedAmount + "x Items Updated " + "By json: " + jsonName);
    }
    static GetAPIPrices() {
        const tables = this.databaseServer.getTables();
        const prices = tables.templates.prices;
        if (this.updated)
            return;
        const url = 'https://api.tarkov.dev/graphql?query=%7BitemsByType(type:any)%7Bid%20name%20avg24hPrice%7D%7D';
        getData(url)
            .then((data) => {
            this.UpdatePricesByItemsArray(prices, "Price Update Through Tarkov.Dev API", data);
            this.UpdateByManualPrices(prices);
        })
            .catch((error) => {
            this.UpdateByManualPrices(prices);
        });
    }
    static UpdateByManualPrices(priceTable) {
        if (this.updated)
            return;
        const userPricePacks = getJsonFilesInfoInFolder("user/mods/Yakhmets-FleaMarket/config/MyCustomPricePacks");
        userPricePacks.forEach(pack => {
            this.UpdatePricesByItemsArray(priceTable, pack.name, parseJSON(readFile(pack.path)));
        });
        //Remove old offers
        const ragfairOfferService = mod.container.resolve("RagfairOfferService");
        for (let offer of ragfairOfferService.getOffers()) {
            try {
                if (offer == null)
                    continue;
                if (offer._id == null)
                    continue;
                ragfairOfferService.removeOfferById(offer._id);
            }
            catch (e) {
            }
        }
        //Generate the new prices
        mod.ragfairPriceService.generateDynamicPrices();
        //Generate offers with new prices
        const traders = this.databaseServer.getTables().traders;
        for (const traderId in traders) {
            traders[traderId].base.refreshTraderRagfairOffers = true;
        }
        mod.ragfairOfferGenerator.generateDynamicOffers();
        //Add new offers with the new prices
        //mod.container.resolve<RagfairServer>("RagfairServer").addPlayerOffers();
        //Over
        this.logger.success(this.modname + " Prices are updated successfully");
        this.updated = true;
    }
}
module.exports = { mod: new mod() };
//# sourceMappingURL=mod.js.map