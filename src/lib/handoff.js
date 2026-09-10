/* Handing a file to the phone.

   A blob URL on an anchor with `download` is the desktop pattern, and iOS
   Safari ignores the download attribute outright: the tap appears to do
   nothing. That is the whole reason the calendar buttons did nothing on an
   iPhone. The iOS route is the share sheet, which has Calendar and Files in
   it, so that is tried first wherever it is offered.

   Nothing here is awaited before the share call. iOS only allows sharing
   inside the gesture that triggered it, and an await in between loses that. */

const canShareFiles = (file) => {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
};

const anchorDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return url;
};

/**
 * Give the file to whatever this device actually uses.
 * Returns how it went, so the message on screen can be true rather than hopeful.
 */
export function handOff(content, filename, mime, { title } = {}) {
  const file = new File([content], filename, { type: mime });

  if (canShareFiles(file)) {
    /* Not awaited: the caller stays inside the user gesture, and a rejection
       here is usually just the person closing the share sheet. */
    navigator.share({ files: [file], title: title || filename }).catch((err) => {
      if (err && err.name === "AbortError") return;
      anchorDownload(new Blob([content], { type: mime }), filename);
    });
    return "shared";
  }

  const url = anchorDownload(new Blob([content], { type: mime }), filename);

  /* Safari without the share API ignores `download` too, so the file would
     silently go nowhere. Opening it at least lets the person act on it. */
  const iosLike = /iP(hone|ad|od)/.test(navigator.userAgent || "");
  if (iosLike) {
    window.open(url, "_blank");
    return "opened";
  }
  return "downloaded";
}

/** What to tell someone after handing them a calendar file. */
export const handoffMessage = (how) =>
  how === "shared"
    ? "Choose Calendar to add it"
    : how === "opened"
      ? "Opened it, add it from there"
      : "Saved to your downloads";
