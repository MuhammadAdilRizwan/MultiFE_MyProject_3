export type CatalogErrorCode = "fabric_not_publishable";

export class CatalogError extends Error {
  code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}
