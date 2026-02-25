/**
 * SplatMesh — R3F wrapper for the Spark Gaussian splat mesh.
 * Use inside a SparkRenderer component.
 */

import { extend } from '@react-three/fiber'
import { SplatMesh as SparkSplatMesh } from '@sparkjsdev/spark'

export const SplatMesh = extend(SparkSplatMesh)
