import marianiAsset from "@/assets/senate-emblems/mariani.png.asset.json";
import mercantileCuriaAsset from "@/assets/senate-emblems/mercantile-curia.png.asset.json";
import optimateConcordAsset from "@/assets/senate-emblems/optimate-concord.png.asset.json";
import pompeianiAsset from "@/assets/senate-emblems/pompeiani.png.asset.json";
import popularesUnionAsset from "@/assets/senate-emblems/populares-union.png.asset.json";
import provincialAssemblyAsset from "@/assets/senate-emblems/provincial-assembly.png.asset.json";
import republicanShipwrightsAsset from "@/assets/senate-emblems/republican-shipwrights.png.asset.json";
import sullianiCoalitionAsset from "@/assets/senate-emblems/sulliani-coalition.png.asset.json";
import tsaesarianiAsset from "@/assets/senate-emblems/tsaesariani.png.asset.json";

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