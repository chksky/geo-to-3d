import fs from 'fs';
import * as turf from '@turf/turf';
import { geoJsonToGltf } from './geoJsonToGltf.js';
import { simplifyFeatures } from './simplify.js';

const files = fs.readdirSync('./ukraine-data');

const labels = JSON.parse(fs.readFileSync('./ukraine-data/labels.json')).features;

const regions = [];

files
  .filter((f) => !f.includes('labels'))
  .forEach((fileName) => {
    const geometry = JSON.parse(fs.readFileSync(`./ukraine-data/${fileName}`));
    regions.push(turf.feature(geometry, { id: fileName.split('.')[0] }));
  });

const ukraineGeoJson = turf.featureCollection(regions.map((r) => turf.rewind(r)));
fs.writeFileSync('./ukraine.json', JSON.stringify(ukraineGeoJson, null, 2));

const simpleRegions = simplifyFeatures(ukraineGeoJson, 0.03, 0.01);

const labelsGeoJson = turf.featureCollection([
  ...simpleRegions.features.map(
    (f) =>
      labels.find((l) => l.properties.id == f.properties.id) ||
      turf.centroid(f, { properties: f.properties })
  )
]);

const cleanRegions = simpleRegions.features.map((f) => {
  if (f.geometry.type === 'MultiPolygon') {
    return turf.polygon(
      f.geometry.coordinates.sort((a, b) => b[0].length - a[0].length)[0],
      f.properties
    );
  } else return f;
});

fs.writeFileSync('./ukraine-labels.json', JSON.stringify(labelsGeoJson, null, 2));
fs.writeFileSync(`./simple-ukraine.json`, JSON.stringify(simpleRegions, null, 2));
await geoJsonToGltf(
  turf.featureCollection([
    ...cleanRegions,
    ...labelsGeoJson.features.filter((f) => f.geometry.type === 'Point')
  ]),
  `./out/ukraine-regions.glb`
);
