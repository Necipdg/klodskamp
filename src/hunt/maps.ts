// Banerne i Kæmpejagt
import { buildCity, type CityMap, type HuntMapId } from './city';
import { buildValley } from './valley';
import { buildHarbor } from './harbor';

export const HUNT_MAPS: { id: HuntMapId; name: string; desc: string }[] = [
  { id: 'ravnsdalen', name: 'Ravnsdalen', desc: 'Eventyrdal omkranset af bjerge: kongeborg på en klippe, by, flod med stenbro, kæmpeskov, ruiner, vindmøller og et fyrtårn.' },
  { id: 'saltvig', name: 'Saltvig', desc: 'Havneby inderst i en fjord: kaj med pakhuse, skibe ved bryggerne, torv foran Rådhuset, kirke, søfort og fyrtårn. Kæmper vader ind fra havet.' },
  { id: 'bastionen', name: 'Bastionen', desc: 'Murby med brede gader, flade tage, et klokketårn midt på pladsen og smalle gyder.' },
];

export function buildHuntMap(id: HuntMapId): CityMap {
  return id === 'ravnsdalen' ? buildValley() : id === 'saltvig' ? buildHarbor() : buildCity();
}
