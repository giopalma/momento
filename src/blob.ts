export interface BlobPoint {
  x: number
  y: number
}

const phase = (seed: number, index: number) => {
  const value = Math.sin(seed * 997 + index * 78.233) * 43758.5453
  return (value - Math.floor(value)) * Math.PI * 2
}

const motion = (seed: number, index: number, time: number) =>
  (Math.sin(time * .72 + phase(seed, index)) + 1) / 2

export function createRectBlobPoints(width: number, height: number, margin: number, seed: number, time: number, amplitudeRatio = .055): BlobPoint[] {
  const amplitude = Math.min(width, height) * amplitudeRatio
  const fractions = [.12, .37, .63, .88]
  const points: BlobPoint[] = []
  let index = 0

  for (const fraction of fractions) {
    const offset = amplitude * (.35 + motion(seed, index, time) * .65 + (index % 2 === 0 ? .28 : 0))
    points.push({ x: width * fraction + Math.sin(time * .41 + phase(seed, index++)) * amplitude * .16, y: margin - offset })
  }
  for (const fraction of fractions) {
    const offset = amplitude * (.35 + motion(seed, index, time) * .65 + (index % 2 === 0 ? .28 : 0))
    points.push({ x: width - margin + offset, y: height * fraction + Math.sin(time * .39 + phase(seed, index++)) * amplitude * .16 })
  }
  for (const fraction of [...fractions].reverse()) {
    const offset = amplitude * (.35 + motion(seed, index, time) * .65 + (index % 2 === 0 ? .28 : 0))
    points.push({ x: width * fraction + Math.sin(time * .43 + phase(seed, index++)) * amplitude * .16, y: height - margin + offset })
  }
  for (const fraction of [...fractions].reverse()) {
    const offset = amplitude * (.35 + motion(seed, index, time) * .65 + (index % 2 === 0 ? .28 : 0))
    points.push({ x: margin - offset, y: height * fraction + Math.sin(time * .37 + phase(seed, index++)) * amplitude * .16 })
  }

  return points
}

export function createRadialBlobPoints(width: number, height: number, minRadius: number, amplitude: number, count: number, seed: number, time: number): BlobPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2 - Math.PI / 2
    const lobe = index % 2 === 0 ? amplitude : amplitude * .25
    const radius = minRadius + lobe + amplitude * .25 * motion(seed, index, time)
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    }
  })
}

export function closedSplinePath(points: BlobPoint[]) {
  if (points.length < 3) return ''
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const after = points[(index + 2) % points.length]
    const control1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 }
    const control2 = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 }
    path += ` C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)}, ${control2.x.toFixed(2)} ${control2.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
  }

  return `${path} Z`
}
