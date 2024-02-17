import { DependencyContainer } from "tsyringe";

import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import * as fs from 'fs';

import { RagfairServer } from "@spt-aki/servers/RagfairServer";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";
import { RagfairOfferGenerator } from "@spt-aki/generators/RagfairOfferGenerator";
import path from 'path';
import axios from 'axios';

interface AxiosResponseData {
    data: Data;
}
interface JsonFileInfo {
    path: string;
    name: string;
}

interface Data {
    itemsByType: Item[];
}
function readFile(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error("Error reading file:", error);
        return '';
    }
}

function getJsonFilesInfoInFolder(folderPath: string): JsonFileInfo[] {
    const files = fs.readdirSync(folderPath);
    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
    return jsonFiles.map(file => ({
        path: path.join(folderPath, file),
        name: file
    }));
}


async function getData(url: string): Promise<Item[]> {
    try {
        const response = await axios.get<AxiosResponseData>(url);
        return response.data.data.itemsByType;
    } catch (error) {
        console.error("Failed to establish connection with Tarkov.Dev database", error);
        return [];
    }
}

interface Item {
    id: string;
    name: string;
    avg24hPrice: number;
}

function parseJSON(jsonData: string): Item[] {
    try {
        const parsedData = JSON.parse(jsonData);
        const itemsByType = parsedData.data.itemsByType;
        return itemsByType.map((item: any) => ({
            id: item.id,
            name: item.name,
            avg24hPrice: item.avg24hPrice
        }));
    } catch (error) {
        console.error("PLEASE SEND THIS ERROR TO MOD OWNER - Error parsing JSON data:", error);
        return [];
    }
}

class mod implements IPostDBLoadMod {
    static container: DependencyContainer;
    static logger: ILogger;
    static updated = false;
    static modname = "YKFLEA:";
    static errorthrowed = false;
    static databaseServer;
    static ragfairPriceService;
    static ragfairOfferGenerator;

    public postDBLoad(container: DependencyContainer): void {
        mod.logger = container.resolve<ILogger>("WinstonLogger");
        mod.container = container;
        mod.databaseServer = mod.container.resolve<DatabaseServer>("DatabaseServer");
        mod.ragfairOfferGenerator = container.resolve<RagfairOfferGenerator>("RagfairOfferGenerator");
        mod.ragfairPriceService = container.resolve<RagfairPriceService>("RagfairPriceService");
        mod.GetAPIPrices();
    }

    static UpdatePricesByItemsArray(priceTable, jsonName: string, items: Item[]) {

        this.logger.success(this.modname + "Price pack being added to database: " + jsonName);
        var updatedAmount = 0;
        for (let index = 0; index < items.length; index++) {
            const item = items[index];

            //if (this.priceTable == null) continue;
            if (item == null || item.id == null || priceTable[items[index].id] == null) continue;

            if (item && priceTable[item.id]) {
                priceTable[item.id] = item.avg24hPrice;
                updatedAmount++;
            }
        }

        if (items.length > 1) mod.logger.success(this.modname + "  " + updatedAmount + "x Items Updated " + "By json: " + jsonName)

    }


    static GetAPIPrices() {
        const tables = this.databaseServer.getTables();
        const prices = tables.templates.prices;

        if (this.updated) return
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
        if (this.updated) return

        const userPricePacks = getJsonFilesInfoInFolder("user/mods/Yakhmets-FleaMarket/config/MyCustomPricePacks")
        userPricePacks.forEach(pack => {
            this.UpdatePricesByItemsArray(priceTable, pack.name, parseJSON(readFile(pack.path)));
        });


        //Remove old offers
        const ragfairOfferService = mod.container.resolve<RagfairOfferService>("RagfairOfferService");
        for (let offer of ragfairOfferService.getOffers()) {
            try {
                if (offer == null) continue
                if (offer._id == null) continue

                ragfairOfferService.removeOfferById(offer._id);
            } catch (e) {

            }
        }

        //Generate the new prices
        mod.ragfairPriceService.generateDynamicPrices();
        //Generate offers with new prices
        const traders = this.databaseServer.getTables().traders;
        for (const traderId in traders) {
            traders[traderId].base.refreshTraderRagfairOffers = true;
        }
        mod.ragfairOfferGenerator.generateDynamicOffers()
        //Add new offers with the new prices
        //mod.container.resolve<RagfairServer>("RagfairServer").addPlayerOffers();

        //Over
        this.logger.success(this.modname + " Prices are updated successfully");
        this.updated = true;
    }
}

module.exports = { mod: new mod() }