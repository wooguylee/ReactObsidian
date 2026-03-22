export function EditorDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Apply',
  secondaryLabel,
  onConfirm,
  onSecondaryAction,
  onClose,
}) {
  if (!open) {
    return null
  }

  return (
    <div className="obsidian-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="obsidian-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="obsidian-dialog__header">
          <div>
            <p className="obsidian-workspace__eyebrow">Editor Action</p>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="obsidian-dialog__close" onClick={onClose}>
            x
          </button>
        </div>

        <div className="obsidian-dialog__body">{children}</div>

        <div className="obsidian-dialog__footer">
          {secondaryLabel && onSecondaryAction ? (
            <button type="button" onClick={onSecondaryAction}>
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="is-accent" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
