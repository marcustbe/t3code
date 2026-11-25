import { PROVIDER_SEND_TURN_MAX_IMAGE_BYTES, type EnvironmentId } from "@t3tools/contracts";
import { msg } from "gt-react";
import { useEffect, useRef, useState } from "react";
import type { ComposerImageAttachment } from "../../composerDraftStore";
import { m } from "../../i18n/messages";
import { releaseAttachmentUpload, startAttachmentUpload } from "../../lib/attachmentUploadQueue";
import { isHeicImageFile, prepareImageForAttachment } from "../../lib/imageCompression";
import { randomUUID } from "../../lib/utils";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentServerConfigsAtom } from "../../state/server";
import type { ChatAttachment } from "../../types";

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isHeicImageFile(file);
}

/** Images among pasted or dropped files; anything else is left to the text box. */
export function imageFilesFrom(transfer: DataTransfer): File[] {
  return Array.from(transfer.files).filter(isImageFile);
}

/** Servers with a config take uploads; older ones get images inlined at send time. */
export function environmentUsesAttachmentUploads(environmentId: EnvironmentId): boolean {
  return (appAtomRegistry.get(environmentServerConfigsAtom).get(environmentId) ?? null) !== null;
}

/**
 * The attachments of a message being edited: the original ones it keeps, and images pasted or
 * dropped into the edit box. Added images upload right away, like the composer's, and are
 * released again if the edit is cancelled.
 */
export function useMessageEditAttachments(input: {
  readonly environmentId: EnvironmentId;
  readonly initialAttachments: ReadonlyArray<ChatAttachment>;
}) {
  const { environmentId } = input;
  const [kept, setKept] = useState<ReadonlyArray<ChatAttachment>>(input.initialAttachments);
  const [added, setAdded] = useState<ReadonlyArray<ComposerImageAttachment>>([]);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Read by the unmount cleanup, which must see the latest images and whether they were sent.
  const addedRef = useRef<ReadonlyArray<ComposerImageAttachment>>([]);
  const sentRef = useRef(false);
  const setAddedImages = (next: ReadonlyArray<ComposerImageAttachment>) => {
    addedRef.current = next;
    setAdded(next);
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases previews and unsent uploads when the edit box closes
  useEffect(
    () => () => {
      for (const image of addedRef.current) {
        URL.revokeObjectURL(image.previewUrl);
        if (!sentRef.current) releaseAttachmentUpload(image.id);
      }
    },
    [],
  );

  const addImages = async (files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    setError(null);
    setPreparing((count) => count + files.length);
    const usesUploads = environmentUsesAttachmentUploads(environmentId);
    for (const file of files) {
      const result = await prepareImageForAttachment(
        file,
        PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
      ).catch(() => ({ ok: false, reason: "unreadable" }) as const);
      setPreparing((count) => count - 1);
      if (!result.ok) {
        setError(
          result.reason === "unreadable"
            ? m(msg("''{name}'' could not be read as an image.", { name: file.name }))
            : m(
                msg("''{name}'' is too large to attach, even after compression.", {
                  name: file.name,
                }),
              ),
        );
        continue;
      }
      const image: ComposerImageAttachment = {
        type: "image",
        id: randomUUID(),
        name: result.file.name || "image",
        mimeType: result.file.type,
        sizeBytes: result.file.size,
        previewUrl: URL.createObjectURL(result.file),
        file: result.file,
      };
      if (usesUploads) startAttachmentUpload({ environmentId, image });
      setAddedImages([...addedRef.current, image]);
    }
  };

  const remove = (id: string) => {
    setKept((current) => current.filter((attachment) => attachment.id !== id));
    const image = addedRef.current.find((candidate) => candidate.id === id);
    if (!image) return;
    URL.revokeObjectURL(image.previewUrl);
    releaseAttachmentUpload(image.id);
    setAddedImages(addedRef.current.filter((candidate) => candidate.id !== id));
  };

  return {
    kept,
    added,
    preparing: preparing > 0,
    error,
    changed: added.length > 0 || kept.length !== input.initialAttachments.length,
    count: kept.length + added.length,
    addImages,
    remove,
    /** After a send the uploads belong to the new message; only the previews are let go. */
    markSent: () => {
      sentRef.current = true;
    },
  };
}
