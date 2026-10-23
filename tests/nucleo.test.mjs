import test from "node:test";
import assert from "node:assert/strict";
import { hashAccion, puedeEjecutar, parsePropuesta, veredicto, toca } from "../src/nucleo.ts";

const M = ["leads_7d"];
const A = { tipo: "tarea_oficina", agente: "ciro", detalle: "Write 3 ideas to attract restaurants" };

test("hash changes when the action changes and ignores key order", () => {
  assert.equal(hashAccion(A), hashAccion({ detalle: A.detalle, agente: "ciro", tipo: "tarea_oficina" }));
  assert.notEqual(hashAccion(A), hashAccion({ ...A, detalle: A.detalle + "!" }));
});

test("approval is tied to the exact version", () => {
  const h = hashAccion(A);
  assert.equal(puedeEjecutar({ estado: "aprobada", accion: A, aprobada_hash: h }), true);
  assert.equal(puedeEjecutar({ estado: "aprobada", accion: { ...A, detalle: "something else" }, aprobada_hash: h }), false);
  assert.equal(puedeEjecutar({ estado: "propuesta", accion: A, aprobada_hash: h }), false);
  assert.equal(puedeEjecutar({ estado: "aprobada", accion: A, aprobada_hash: null }), false);
});

test("parsePropuesta accepts valid JSON and rejects invented types or metrics", () => {
  const ok = JSON.stringify({ titulo: "t", razon: "r", metrica: "leads_7d", objetivo: 10, accion: A });
  assert.equal(parsePropuesta("texto " + ok + " fin", M)?.accion.tipo, "tarea_oficina");
  assert.equal(parsePropuesta(ok.replace("tarea_oficina", "enviar_email"), M), null);
  assert.equal(parsePropuesta(ok.replace("leads_7d", "ventas"), M), null);
  assert.equal(parsePropuesta("no es json", M), null);
  assert.equal(parsePropuesta(null, M), null);
});

test("veredicto never assumes success without data", () => {
  assert.equal(veredicto(null, 5, 10), "sin_datos");
  assert.equal(veredicto(2, 12, 10), "mejora");
  assert.equal(veredicto(5, 3, 10), "empeora");
  assert.equal(veredicto(5, 5, 10), "sin_cambio");
});

test("toca respects the days", () => {
  const ahora = Date.now();
  assert.equal(toca(new Date(ahora - 4 * 86400000).toISOString(), 3, ahora), true);
  assert.equal(toca(new Date(ahora - 1 * 86400000).toISOString(), 3, ahora), false);
});
