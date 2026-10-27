import type {
  Building,
  EnergySource,
  MobilityItem,
  Regulation,
  SmartSystem,
  StorageSystem,
  TransmissionLine,
  WeatherCondition,
} from "../types";
import { createEntityService } from "./entityService";

export const sourcesService = createEntityService<EnergySource>("sources");
export const storageService = createEntityService<StorageSystem>("storage");
export const buildingsService = createEntityService<Building>("buildings");
export const linesService = createEntityService<TransmissionLine>("lines");
export const mobilityService = createEntityService<MobilityItem>("mobility");
export const systemsService = createEntityService<SmartSystem>("systems");
export const weatherService = createEntityService<WeatherCondition>("weather");
export const regulationsService = createEntityService<Regulation>("regulations");
