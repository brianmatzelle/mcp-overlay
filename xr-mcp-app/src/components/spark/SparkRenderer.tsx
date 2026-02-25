/**
 * SparkRenderer — R3F wrapper for the Spark Gaussian splat renderer.
 * Must wrap all SplatMesh components in the scene.
 */

import { extend } from '@react-three/fiber'
import { SparkRenderer as SparkSparkRenderer } from '@sparkjsdev/spark'

export const SparkRenderer = extend(SparkSparkRenderer)
