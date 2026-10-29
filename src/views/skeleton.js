// Скелет нейрона: линии дендритов от тела наружу. Общий для видов
// «Тоннель» и «Волна»: один и тот же нейрон, а кожу на скелет надевает вид.
// Единицы клетки: радиус тела 1, аксон уходит вперёд, к -z.
import * as THREE from 'three'

const STEP = 0.12
// дальше этого от тела ветка не тянется: по этой длине считается порядок
export const REACH = 6.5

function randomDirection(out) {
  do {
    out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
  } while (out.lengthSq() > 1 || out.lengthSq() < 1e-4)
  return out.normalize()
}

// ветка растёт короткими шагами и плавно поворачивает, к кончику тоньше
function grow(start, direction, length, width, from, branches, forks) {
  const point = start.clone()
  const dir = direction.clone()
  const turn = new THREE.Vector3()
  const branch = { points: [], tangents: [], widths: [], orders: [] }
  const count = Math.max(4, Math.round(length / STEP))
  for (let k = 0; k <= count; k++) {
    const share = k / count
    branch.points.push(point.clone())
    branch.tangents.push(dir.clone())
    branch.widths.push(width * (1 - 0.75 * share))
    branch.orders.push(Math.min(1, (from + share * length) / REACH))
    dir.add(randomDirection(turn).multiplyScalar(0.18)).normalize()
    // не лезть в сторону аксона
    if (dir.z < -0.4) dir.z *= 0.5
    point.addScaledVector(dir, length / count)
  }
  branches.push(branch)
  forks.forEach((share) => {
    const k = Math.floor(share * count)
    const side = randomDirection(turn).add(branch.tangents[k]).normalize()
    grow(
      branch.points[k],
      side,
      length * (0.35 + Math.random() * 0.25),
      branch.widths[k] * 0.7,
      from + share * length,
      branches,
      []
    )
  })
}

// pyramidal: один длинный верхушечный дендрит и короткие у основания,
// иначе звёздчатый нейрон: несколько равных дендритов во все стороны
export function growSkeleton(pyramidal) {
  const branches = []
  const dir = new THREE.Vector3()
  if (pyramidal) {
    dir.set(0.15, 1, 0.35).normalize()
    grow(dir.clone(), dir, 5.6, 0.34, 1, branches, [0.3, 0.5, 0.72])
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.6
      dir.set(Math.cos(angle), -0.55, 0.3 + Math.sin(angle) * 0.6).normalize()
      grow(dir.clone(), dir, 2 + Math.random() * 1.2, 0.24, 1, branches, [0.55])
    }
  } else {
    const count = 5 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      // к камере и в стороны: оттуда в нейрон приходит сигнал
      randomDirection(dir)
        .add(new THREE.Vector3(0, 0, 0.75))
        .normalize()
      grow(
        dir.clone(),
        dir,
        2.8 + Math.random() * 1.8,
        0.28,
        1,
        branches,
        [0.4, 0.66]
      )
    }
  }
  return branches
}

// Пара векторов поперёк ветки. Боковой вектор переносится с прошлой точки,
// поэтому кожа вдоль ветки не перекручивается.
export function crossFrame(tangent, previousSide) {
  const side = previousSide
    ? previousSide.clone().addScaledVector(tangent, -previousSide.dot(tangent))
    : new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0.01))
  if (side.lengthSq() < 1e-6)
    side.crossVectors(tangent, new THREE.Vector3(1, 0, 0))
  side.normalize()
  const other = new THREE.Vector3().crossVectors(tangent, side).normalize()
  return [side, other]
}
