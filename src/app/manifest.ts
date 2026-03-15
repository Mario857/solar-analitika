import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solar Analitika — HEP + FusionSolar",
    short_name: "Solar Analitika",
    description: "Analitička ploča za praćenje solarne energije, HEP mjerenja i FusionSolar podataka",
    start_url: "/",
    display: "standalone",
    background_color: "#060a0f",
    theme_color: "#f0a420",
    orientation: "portrait-primary",
    categories: ["utilities", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
