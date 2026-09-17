// OpenStreetMap embed без API-ключа — используется для мини-карты филиала
// школы (SchoolBranch.latitude/longitude, 2026-09-17). Никакой сторонней
// JS-библиотеки, просто iframe с bbox вокруг точки и маркером.
export function osmEmbedUrl(latitude: number, longitude: number, deltaDeg = 0.006): string {
  const params = new URLSearchParams({
    bbox: `${longitude - deltaDeg},${latitude - deltaDeg},${longitude + deltaDeg},${latitude + deltaDeg}`,
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}
