import { uploadKartaKatalogowa, clearKartaKatalogowa } from "@/utils/kartaKatalogowaApi";

/**
 * Po zapisie pozycji katalogu — wgrywa oczekujący PDF lub czyści kartę.
 * @returns {Promise<string|null>} aktualny URL karty
 */
export async function applyKartaKatalogowaAfterSave({
  entityType,
  entityId,
  pendingFile,
  previousUrl,
  cleared,
}) {
  if (!entityId) return previousUrl ?? null;

  if (cleared && previousUrl) {
    await clearKartaKatalogowa(entityType, entityId);
    return null;
  }

  if (pendingFile) {
    const { url } = await uploadKartaKatalogowa(entityType, entityId, pendingFile);
    return url;
  }

  return previousUrl ?? null;
}
