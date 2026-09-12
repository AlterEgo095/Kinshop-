// KinShop — Kill-switch des simulateurs de paiement (correctifs audit Task 19)
// ⚠️ Server-only : à importer UNIQUEMENT dans les routes API.
//
// PRINCIPE (failles F-01/F-02/F-03) : la bascule démo/prod doit être EXPLICITE.
// Avant correction, les simulateurs s'activaient AUTOMATIQUEMENT dès qu'un
// fournisseur réel n'était pas configuré — une configuration incomplète en
// production offrait donc gratuitement : Premium +30 j, commandes « payées »
// sans argent, campagnes Boost actives.
//
// Désormais : simulateur actif ⇔ variable d'environnement PAYMENT_SIMULATION=on
// (jamais définie en production) ET fournisseur réel absent. Sans cette variable,
// TOUTE simulation renvoie 403 — y compris quand Chariow/FlexPay ne sont pas
// encore branchés.

import { NextResponse } from "next/server"

/** Simulation de paiement explicitement activée dans CET environnement ? */
export function isPaymentSimulationEnabled(): boolean {
  const v = (process.env.PAYMENT_SIMULATION ?? "").trim().toLowerCase()
  return v === "on" || v === "true" || v === "1"
}

/** Réponse standard quand la simulation est demandée hors mode démo explicite. */
export function simulationDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: "Simulation de paiement désactivée : seul un paiement réel vérifié est accepté." },
    { status: 403 },
  )
}
