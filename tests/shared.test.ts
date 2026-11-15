import { describe, expect, it } from "vitest";
import { formatearDinero, posicionEntre, previsionPonderada } from "../shared/crm";

describe("posicionEntre", () => {
  it("coloca al principio, al final y entre dos tarjetas", () => {
    expect(posicionEntre(null, null)).toBe(1000);
    expect(posicionEntre(null, 1000)).toBe(0);
    expect(posicionEntre(3000, null)).toBe(4000);
    expect(posicionEntre(1000, 2000)).toBe(1500);
  });

  it("admite muchas inserciones seguidas en el mismo hueco", () => {
    let siguiente = 2000;
    for (let i = 0; i < 40; i++) siguiente = posicionEntre(1000, siguiente);
    expect(siguiente).toBeGreaterThan(1000);
    expect(siguiente).toBeLessThan(2000);
  });
});

describe("previsionPonderada", () => {
  it("pondera por probabilidad e ignora las cerradas", () => {
    expect(
      previsionPonderada([
        { etapa: "propuesta", valor_centavos: 100000 }, // 50 %
        { etapa: "negociacion", valor_centavos: 40000 }, // 75 %
        { etapa: "ganado", valor_centavos: 999999 },
        { etapa: "perdido", valor_centavos: 999999 },
      ]),
    ).toBe(80000);
  });
});

describe("formatearDinero", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatearDinero(123456789)).toBe("$1.234.567,89");
    expect(formatearDinero(250000, false)).toBe("$2.500");
    expect(formatearDinero(-500)).toBe("-$5,00");
  });
});
