import assert from 'node:assert/strict';

// The preserved drawings use filled M/C/Z paths only. Fail on new syntax instead
// of silently calculating a wrong crop if an artist changes the source format.
export function parseDrawing(svg) {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  assert(root, 'Missing SVG root');
  const width = Number(/\bwidth="([\d.]+)"/.exec(root[1])?.[1]);
  const height = Number(/\bheight="([\d.]+)"/.exec(root[1])?.[1]);
  assert(width > 0 && height > 0, 'Expected source dimensions in pixels');
  assert(!/<(?:script|foreignObject|image|use|g)\b|\bon\w+\s*=|\b(?:href|transform|stroke)\s*=|<!DOCTYPE|<!ENTITY/i.test(svg), 'Unsupported SVG content');
  const paths = [...svg.matchAll(/<path\b[^>]*\/>/g)].map(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
    assert.deepEqual(Object.keys(attributes).sort(), ['d', 'fill'], 'Only filled paths are supported');
    assert(/^#[\da-f]{6}$/i.test(attributes.fill), 'Expected an opaque flat path fill');
    return { tag, d: attributes.d, fill: attributes.fill.toUpperCase(), bounds: pathBounds(attributes.d) };
  });
  assert(paths.length > 1, 'Expected background and character paths');
  const remaining = svg.replace(/<!--[\s\S]*?-->|<\/?svg\b[^>]*>|<path\b[^>]*\/>|<\?xml[^>]*\?>/gi, '').trim();
  assert.equal(remaining, '', 'Unsupported element or markup in source drawing');
  return { width, height, paths };
}

function roots(p0, p1, p2, p3) {
  // The derivative of a cubic Bezier, with the common factor of three removed.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const sqrt = Math.sqrt(discriminant);
  return [(-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a)];
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export function pathBounds(d) {
  const tokenPattern = /[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;
  const tokens = d.match(tokenPattern) ?? [];
  assert.equal(d.replace(tokenPattern, '').replace(/[\s,]/g, ''), '', 'Unexpected path syntax');
  let index = 0;
  let command;
  let point = [0, 0];
  let start = [0, 0];
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const include = ([x, y]) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  const read = () => {
    assert(index < tokens.length && !/^[a-z]$/i.test(tokens[index]), 'Missing path coordinate');
    const value = Number(tokens[index++]);
    assert(Number.isFinite(value), 'Invalid path coordinate');
    return value;
  };
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++];
    assert(command, 'Path command is required');
    const relative = command === command.toLowerCase();
    const coordinate = () => [read() + (relative ? point[0] : 0), read() + (relative ? point[1] : 0)];
    switch (command.toUpperCase()) {
      case 'M': {
        point = coordinate();
        start = [...point];
        include(point);
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        point = coordinate();
        include(point);
        break;
      }
      case 'C': {
        const from = point;
        const c1 = coordinate();
        const c2 = coordinate();
        const to = coordinate();
        include(from);
        include(to);
        const extrema = [...roots(from[0], c1[0], c2[0], to[0]), ...roots(from[1], c1[1], c2[1], to[1])];
        for (const t of extrema) if (t > 0 && t < 1) {
          include([cubic(from[0], c1[0], c2[0], to[0], t), cubic(from[1], c1[1], c2[1], to[1], t)]);
        }
        point = to;
        break;
      }
      case 'Z':
        include(start);
        point = [...start];
        command = undefined;
        break;
      default:
        assert.fail(`Unsupported path command: ${command}`);
    }
  }
  assert(Object.values(bounds).every(Number.isFinite), 'Empty path');
  return bounds;
}

export function unionBounds(paths) {
  assert(paths.length > 0, 'Missing visible paths');
  return paths.reduce((bounds, path) => ({
    minX: Math.min(bounds.minX, path.bounds.minX),
    minY: Math.min(bounds.minY, path.bounds.minY),
    maxX: Math.max(bounds.maxX, path.bounds.maxX),
    maxY: Math.max(bounds.maxY, path.bounds.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}
