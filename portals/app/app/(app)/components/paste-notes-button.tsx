"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DialogForm,
  Icon,
  Textarea,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { PasteNotesResult } from "../account/[id]/paste-notes-action";

export interface PasteNotesButtonProps {
  readonly accountId: string;
  readonly onPaste: (
    accountId: string,
    rawText: string,
  ) => Promise<PasteNotesResult>;
}

export function PasteNotesButton({ accountId, onPaste }: PasteNotesButtonProps) {
  const { FIELD_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast({ tone: "warning", title: T.pasteNotesEmpty });
      return;
    }
    startTransition(async () => {
      const result = await onPaste(accountId, text);
      if (result.ok) {
        toast({ tone: "success", title: T.pasteNotesDone(result.proposalCount) });
        setOpen(false);
        setText("");
      } else {
        toast({ tone: "danger", title: T.pasteNotesFailed });
      }
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Icon name="clipboard" size="xs" />
        {T.pasteNotesButton}
      </Button>
      <DialogForm
        open={open}
        onOpenChange={(v) => {
          if (!v) setText("");
          setOpen(v);
        }}
        title={T.pasteNotesTitle}
        description={T.pasteNotesDescription}
        submitLabel={T.pasteNotesSubmit}
        cancelLabel={T.pasteNotesCancel}
        pendingLabel={T.pasteNotesSubmitting}
        onSubmit={handleSubmit}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={T.pasteNotesPlaceholder}
          rows={12}
          disabled={pending}
        />
      </DialogForm>
    </>
  );
}
