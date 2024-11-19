import * as d3 from "d3";
import * as THREE from "three";
import * as turf from "@turf/turf";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";

const bevel = 0.2;
const depth = 4;
const side = 200;
const extrudeSettings = {
  steps: 1,
  depth,
  bevelEnabled: true,
  bevelThickness: bevel / 10,
  bevelSize: bevel,
  bevelOffset: -bevel,
  bevelSegments: 1,
};

const colorScale = d3
  .scaleLinear()
  .domain([10, 20])
  .range(["#fee32f", "#fc4427"]);

const coordsToNode = (coords, gltfDocument, gltfBuffer, nodeName) => {
  const d = depth;
  const color = new THREE.Color(colorScale(d));

  const shape = new THREE.Shape();

  shape.moveTo(...coords[0]);
  for (let i = 1; i < coords.length; i++) {
    shape.lineTo(...coords[i]);
  }
  shape.lineTo(...coords[0]);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    ...extrudeSettings,
    depth: d,
  });
  const indexedGeo = BufferGeometryUtils.mergeVertices(geometry);

  const indexesArray = indexedGeo.getIndex().array;
  const positionArray = indexedGeo.attributes.position.array;
  const uvArray = indexedGeo.attributes.uv.array;

  const indices = gltfDocument
    .createAccessor()
    .setArray(indexesArray)
    .setType("SCALAR")
    .setBuffer(gltfBuffer);
  const position = gltfDocument
    .createAccessor()
    .setArray(positionArray)
    .setType("VEC3")
    .setBuffer(gltfBuffer);
  const material = gltfDocument
    .createMaterial()
    .setBaseColorHex(color.getHex())
    .setRoughnessFactor(1)
    .setMetallicFactor(0);

  const texcoord = gltfDocument
    .createAccessor()
    .setArray(uvArray)
    .setType("VEC2")
    .setBuffer(gltfBuffer);

  const prim = gltfDocument
    .createPrimitive()
    .setMaterial(material)
    .setIndices(indices)
    .setAttribute("POSITION", position)
    .setAttribute("TEXCOORD_0", texcoord);

  const mesh = gltfDocument.createMesh("District").addPrimitive(prim);

  return {
    node: gltfDocument
      .createNode(nodeName)
      .setMesh(mesh)
      .setTranslation([0, 0, 0]),
    box3: new THREE.Box3().setFromBufferAttribute(geometry.attributes.position),
  };
};

const getK = (ex, ey) => {
  const dx = Math.abs(ex[0] - ex[1]);
  const dy = Math.abs(ey[0] - ey[1]);

  if (dx > dy) return { kx: 1, ky: dy / dx };
  else return { kx: dx / dy, ky: 1 };
};

export const geoJsonToGltf = async (
  geoJson,
  filePath,
  { mobileLabels, desktopLabels },
) => {
  const projection = d3.geoMercator();
  const allCoords = turf.coordAll(geoJson).map(projection);
  const extentX = d3.extent(allCoords.map((c) => c[0])),
    extentY = d3.extent(allCoords.map((c) => c[1]));

  const { kx, ky } = getK(extentX, extentY);
  const scaleX = d3
    .scaleLinear()
    .domain(extentX)
    .range([0, side * kx]);
  const scaleY = d3
    .scaleLinear()
    .domain(extentY)
    .range([0, side * ky]);
  const convertCoords = ([lng, lat]) => [scaleX(lng), scaleY(lat)];

  const document = new Document();
  const buffer = document.createBuffer();

  const scene = document.createScene("Scene");
  const districtsGroup = document.createNode("CityDistricts");
  scene.addChild(districtsGroup);

  const box = new THREE.Box3();

  const polygons = geoJson.features.filter(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon",
  );

  for (const feature of polygons) {
    const desktopCenter = desktopLabels[feature.properties.id];
    const mobileCenter = mobileLabels[feature.properties.id];
    const coords = turf.coordAll(feature).map(projection).map(convertCoords);

    const name = feature.properties.id || "water";
    const { node, box3 } = coordsToNode(coords, document, buffer, name);

    if (desktopCenter && mobileCenter) {
      node.setExtras({
        name,
        desktopLabelPos: desktopCenter,
        mobileLabelPos: mobileCenter,
        labelPos: desktopCenter,
      });
    }
    districtsGroup.addChild(node);

    box.union(box3);
  }

  const centerOffset = box.max.sub(box.min).clone().divideScalar(-2);
  districtsGroup.setTranslation([centerOffset.x, centerOffset.y, 0]);

  const io = new NodeIO();
  await io.write(filePath, document);
};
