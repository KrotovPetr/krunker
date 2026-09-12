const friendly = [
  0x48c6b2, 0x6da9f2, 0xa797df, 0x8dcc97, 0x60c6e4, 0x7591db, 0xb8d486,
  0x82b9ba,
];
const hostile = [
  0xdf8059, 0xc65d68, 0xe7ad59, 0xb9785b, 0xe39389, 0xb86c87, 0xc69a6a,
  0xe66c49,
];
export function playerColor(index: number, ally: boolean) {
  return (ally ? friendly : hostile)[index % 8]!;
}
