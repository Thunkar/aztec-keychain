import { Field } from "@noble/curves/abstract/modular";
import { weierstrassPoints } from "@noble/curves/abstract/weierstrass";
import { Point } from "./point";
import { Fr, GrumpkinScalar } from "./fields";

const grumpkin = weierstrassPoints({
  a: 0n,
  b: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffff0n,
  Fp: Field(
    0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n
  ),
  n: 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n,
  h: 1n,
  Gx: 1n,
  Gy: 0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272cn,
});

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin {
  /**
   * Point generator
   * @returns The generator for the curve.
   */
  public generator(): Point {
    return new Point(
      new Fr(grumpkin.CURVE.Gx),
      new Fr(grumpkin.CURVE.Gy),
      false
    );
  }

  /**
   * Multiplies a point by a scalar (adds the point `scalar` amount of times).
   * @param point - Point to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Result of the multiplication.
   */
  public async mul(point: Point, scalar: GrumpkinScalar): Promise<Point> {
    const noblePoint = new grumpkin.ProjectivePoint(
      point.x.toBigInt(),
      point.y.toBigInt(),
      1n
    );
    const result = noblePoint.multiply(scalar.toBigInt());
    return new Point(new Fr(result.x), new Fr(result.y), false);
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public async add(a: Point, b: Point): Promise<Point> {
    const nobleA = new grumpkin.ProjectivePoint(
      a.x.toBigInt(),
      a.y.toBigInt(),
      1n
    );
    const nobleB = new grumpkin.ProjectivePoint(
      b.x.toBigInt(),
      b.y.toBigInt(),
      1n
    );
    const result = nobleA.add(nobleB);
    return new Point(new Fr(result.x), new Fr(result.y), false);
  }
}
