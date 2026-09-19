import { computeFreeSpace } from '../lib/transports'

describe('computeFreeSpace', () => {
  test('subtracts Order 1 and every approved additional load independently', () => {
    expect(computeFreeSpace(
      { cargo_pallets: 18, cargo_weight_kg: 12_000 },
      { vehicle_capacity_pallets: 33, vehicle_capacity_kg: 24_000 },
      [
        { cargo_pallets: 4, cargo_weight_kg: 2_000 },
        { cargo_pallets: 2, cargo_weight_kg: 1_500 },
      ],
    )).toEqual({ pallets: 9, kg: 8_500, limiting: 'pallets' })
  })

  test('preserves a negative remainder as overload', () => {
    expect(computeFreeSpace(
      { cargo_pallets: 12, cargo_weight_kg: 8_000 },
      { vehicle_capacity_pallets: 18, vehicle_capacity_kg: 10_000 },
      [{ cargo_pallets: 4, cargo_weight_kg: 3_000 }],
    )).toEqual({ pallets: 2, kg: -1_000, limiting: 'kg' })
  })

  test('returns unknown capacity when there is no carrier order', () => {
    expect(computeFreeSpace({ cargo_pallets: 10 }, null, [])).toBeNull()
  })

  test('supports one known capacity dimension without guessing the other', () => {
    expect(computeFreeSpace(
      { cargo_pallets: 8, cargo_weight_kg: 5_000 },
      { vehicle_capacity_kg: 12_000 },
      [],
    )).toEqual({ pallets: null, kg: 7_000, limiting: 'kg' })
  })
})
