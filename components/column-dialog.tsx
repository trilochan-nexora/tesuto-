"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { COLUMN_DOTS, type Column } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ColumnDialog({
  open,
  onOpenChange,
  column,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode */
  column?: Column
  onSubmit: (value: {
    label: string
    description?: string
    dot: string
    limit?: number
  }) => void
}) {
  const [label, setLabel] = useState("")
  const [description, setDescription] = useState("")
  const [dot, setDot] = useState<string>(COLUMN_DOTS[0])
  const [limit, setLimit] = useState("")

  // Seed the form from the column each time the dialog opens.
  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setLabel(column?.label ?? "")
    setDescription(column?.description ?? "")
    setDot(column?.dot ?? COLUMN_DOTS[1])
    setLimit(column?.limit ? String(column.limit) : "")
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, column])

  function save() {
    if (!label.trim()) return
    const n = Number.parseInt(limit, 10)
    onSubmit({
      label: label.trim(),
      description: description.trim() || undefined,
      dot,
      limit: Number.isFinite(n) && n > 0 ? n : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{column ? "Edit column" : "New column"}</DialogTitle>
        </DialogHeader>

        {/* Preview */}
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-3">
          <span className={cn("size-2.5 rounded-full", dot)} />
          <span className="text-sm font-medium">
            {label.trim() || (
              <span className="text-muted-foreground">Column name</span>
            )}
          </span>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="col-label">
              Label text <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="col-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save()
              }}
            />
          </Field>

          <Field>
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {COLUMN_DOTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDot(c)}
                  aria-label={`Colour ${c}`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border-2 transition-colors",
                    dot === c
                      ? "border-foreground"
                      : "border-transparent hover:border-border",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full",
                      c,
                    )}
                  >
                    {dot === c ? (
                      <Check className="size-3.5 text-white" strokeWidth={3} />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="col-limit">Work-in-progress limit</FieldLabel>
            <Input
              id="col-limit"
              type="number"
              min={1}
              placeholder="No limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              The column count turns red when it goes over.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="col-desc">Description</FieldLabel>
            <Textarea
              id="col-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Shown under the column title on the board.
            </p>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!label.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
