export type CatalogErrorCode = "fabric_not_publishable" | "invalid_supplier_integration";

export class CatalogError extends Error {
  code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}
