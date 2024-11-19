import * as turf from '@turf/turf';

const removeHoles = (polygon) => {
  polygon.geometry.coordinates.splice(1, 1);
  return polygon;
};

/**
 * 
 * @param {GeoJSON} featuresGeoJson source GeoJSON
 * @param {number} tolerance higher value means more simplification default is 0.001
 * @param {number} iterations higher value means more smoothing default is 2
 * @returns 
 */
export const simplifyFeatures = (featuresGeoJson, tolerance, iterations) => {
  const { features } = turf.simplify(featuresGeoJson, {
    tolerance: tolerance || 0.001,
    highQuality: true
  });
  const transformedFeatures = features
    .map((f) => turf.polygonSmooth(f, { iterations: iterations || 2, mutate: true }).features[0])
    .map((f) => turf.transformScale(f, 1.07))
    .map((f) => {
      f.properties.area = turf.area(f);
      return f;
    })
    .map((f) => removeHoles(f))
    .sort((a, b) => a.properties.area - b.properties.area);

  for (let i = 0; i < transformedFeatures.length; i++) {
    let featureA = transformedFeatures[i];

    for (let j = 0; j < transformedFeatures.length; j++) {
      if (j === i) continue;

      const featureB = transformedFeatures[j];

      featureA = turf.difference(featureA, featureB);
    }

    transformedFeatures[i] = featureA;
  }
  return turf.featureCollection(transformedFeatures);
};
