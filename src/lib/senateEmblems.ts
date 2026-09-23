import marianiAsset from "@/assets/senate-emblems/mariani.svg.asset.json";
import mercantileCuriaAsset from "@/assets/senate-emblems/mercantile-curia.svg.asset.json";
import optimateConcordAsset from "@/assets/senate-emblems/optimate-concord.svg.asset.json";
import pompeianiAsset from "@/assets/senate-emblems/pompeiani.svg.asset.json";
import popularesUnionAsset from "@/assets/senate-emblems/populares-union.svg.asset.json";
import provincialAssemblyAsset from "@/assets/senate-emblems/provincial-assembly.svg.asset.json";
import republicanShipwrightsAsset from "@/assets/senate-emblems/republican-shipwrights.svg.asset.json";
import sullianiCoalitionAsset from "@/assets/senate-emblems/sulliani-coalition.svg.asset.json";
import tsaesarianiAsset from "@/assets/senate-emblems/tsaesariani.svg.asset.json";

export interface SenateEmblemOption {
  name: string;
  url: string;
}

export const SENATE_EMBLEMS: SenateEmblemOption[] = [
  { name: "Optimate Concord", url: optimateConcordAsset.url },
  { name: "Populares Union", url: popularesUnionAsset.url },
  { name: "Mercantile Curia", url: mercantileCuriaAsset.url },
  { name: "Pompeiani", url: pompeianiAsset.url },
  { name: "Sulliani Coalition", url: sullianiCoalitionAsset.url },
  { name: "Mariani", url: marianiAsset.url },
  { name: "Tsaesariani", url: tsaesarianiAsset.url },
  { name: "Provincial Assembly", url: provincialAssemblyAsset.url },
  { name: "Republican Shipwrights", url: republicanShipwrightsAsset.url },
];