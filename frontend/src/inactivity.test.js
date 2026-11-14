import { inactivityStatus, INACTIVITY_WARNING_MS } from "./inactivity";

const MIN = 60 * 1000;

test("com a sessão automática desligada, nunca avisa nem encerra", () => {
  expect(inactivityStatus({ enabled: false, limitMs: 15 * MIN, lastActivity: 0, now: 10 * 60 * MIN }))
    .toEqual({ expired: false, warningSeconds: null });
});

test("longe do limite: nada a mostrar", () => {
  expect(inactivityStatus({ enabled: true, limitMs: 30 * MIN, lastActivity: 0, now: 20 * MIN }))
    .toEqual({ expired: false, warningSeconds: null });
});

test("no último minuto antes do limite configurado: mostra a contagem em segundos", () => {
  expect(INACTIVITY_WARNING_MS).toBe(60 * 1000);
  expect(inactivityStatus({ enabled: true, limitMs: 30 * MIN, lastActivity: 0, now: 29 * MIN }))
    .toEqual({ expired: false, warningSeconds: 60 });
  expect(inactivityStatus({ enabled: true, limitMs: 30 * MIN, lastActivity: 0, now: 30 * MIN - 12500 }))
    .toEqual({ expired: false, warningSeconds: 13 });
});

test("passou do limite configurado: encerra", () => {
  expect(inactivityStatus({ enabled: true, limitMs: 30 * MIN, lastActivity: 0, now: 30 * MIN }))
    .toEqual({ expired: true, warningSeconds: null });
});

test("o limite é o configurado, não 15 minutos fixos", () => {
  expect(inactivityStatus({ enabled: true, limitMs: 120 * MIN, lastActivity: 0, now: 16 * MIN }))
    .toEqual({ expired: false, warningSeconds: null });
});
