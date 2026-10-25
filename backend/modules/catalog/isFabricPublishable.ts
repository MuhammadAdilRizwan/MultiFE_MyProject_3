import type { FabricRow } from "./types";

// FR-TPL-10: the dangerous default is a fabric that syncs with no option
// data and ends up published with every option enabled, producing orders
// that cannot be made. A fabric is only publishable once at least one of
// its option groups actually has a value to offer.
export function isFabricPublishable(fabric: Pick<FabricRow, "supported_options">): boolean {
  return Object.values(fabric.supported_options).some((values) => values.length > 0);
}
