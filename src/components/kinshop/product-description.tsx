"use client"

// KinShop — Mission Premium : rendu de la description produit mise en forme
// + tableau des caractéristiques structurées.
// Sécurité : rendu 100 % React (aucun innerHTML) — le parseur **gras**/puces
// ne peut pas injecter de HTML, la description d'un vendeur est affichée telle
// quelle, échappée par React. Partagé par la vitrine publique et l'aperçu
// « avant publication » du dashboard.

import { Fragment } from "react"
import { parseDescription, type ProductSpec } from "@/lib/kinshop"
import { cn } from "@/lib/utils"

interface ProductDescriptionProps {
  description: string
  specs?: ProductSpec[] | string // accepte JSON brut (DB) ou déjà normalisé
  className?: string
  dense?: boolean // mode compact (aperçu dashboard)
}

/** Liste de caractéristiques (label/valeur) — grille responsive 2 colonnes. */
export function ProductSpecsTable({
  specs,
  className,
}: {
  specs: ProductSpec[]
  className?: string
}) {
  if (!specs.length) return null
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-muted/60 p-3 text-sm", className)}>
      {specs.map((s, i) => (
        <Fragment key={`${s.label}-${i}`}>
          <dt className="font-medium text-muted-foreground whitespace-nowrap">{s.label}</dt>
          <dd className="text-foreground break-words min-w-0">{s.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/**
 * Description mise en forme : paragraphes (lignes vides), puces (« - », « • »,
 * « * »), gras (« **texte** »). Sans description ni specs, ne rend rien —
 * les fiches legacy sans description restent exactement comme avant.
 */
export function ProductDescription({ description, specs, className, dense = false }: ProductDescriptionProps) {
  const blocks = parseDescription(description)
  const normSpecs: ProductSpec[] = Array.isArray(specs)
    ? specs
    : (() => {
        try {
          const parsed = typeof specs === "string" ? JSON.parse(specs || "[]") : []
          return Array.isArray(parsed)
            ? parsed.filter((x): x is ProductSpec => !!x && typeof x === "object" && !!x.label && !!x.value)
            : []
        } catch {
          return []
        }
      })()

  if (!blocks.length && !normSpecs.length) return null

  return (
    <div className={cn("space-y-2.5", className)}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={`p-${i}`} className={cn("text-sm leading-relaxed text-foreground/90", dense && "text-[13px]")}>
            {b.segments?.map((s, j) =>
              s.bold ? (
                <strong key={`s-${j}`} className="font-semibold text-foreground">
                  {s.text}
                </strong>
              ) : (
                <Fragment key={`s-${j}`}>{s.text}</Fragment>
              ),
            )}
          </p>
        ) : (
          <ul key={`ul-${i}`} className={cn("space-y-1", dense && "space-y-0.5")}>
            {b.items?.map((line, j) => (
              <li key={`li-${j}`} className={cn("flex gap-2 text-sm leading-relaxed text-foreground/90", dense && "text-[13px]")}>
                <span aria-hidden className="text-primary mt-[3px] shrink-0">
                  •
                </span>
                <span className="min-w-0">
                  {line.map((s, k) =>
                    s.bold ? (
                      <strong key={`s-${k}`} className="font-semibold text-foreground">
                        {s.text}
                      </strong>
                    ) : (
                      <Fragment key={`s-${k}`}>{s.text}</Fragment>
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
      <ProductSpecsTable specs={normSpecs} />
    </div>
  )
}
