'use strict';

// src/errors/HadeError.ts
var HadeError = class _HadeError extends Error {
  code;
  context;
  constructor(code, message, context) {
    super(message);
    this.name = "HadeError";
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, _HadeError.prototype);
  }
};
function isHadeError(value) {
  return value instanceof HadeError;
}
function createHadeErrorFactory(options) {
  const baseContext = () => ({
    adapterKind: options.adapterKind,
    adapterName: options.adapterName,
    requestId: options.requestId
  });
  return {
    failed(message, cause, fields) {
      return new HadeError("ADAPTER_FAILED", message, {
        ...baseContext(),
        cause,
        fields
      });
    },
    timeout(timeoutMs, fields) {
      return new HadeError("ADAPTER_TIMEOUT", `Adapter call timed out after ${timeoutMs}ms`, {
        ...baseContext(),
        fields: { ...fields, timeoutMs }
      });
    },
    notConfigured(missing, fields) {
      return new HadeError("ADAPTER_NOT_CONFIGURED", `Adapter missing configuration: ${missing}`, {
        ...baseContext(),
        fields: { ...fields, missing }
      });
    },
    cancelled(reason, fields) {
      return new HadeError("ADAPTER_CANCELLED", reason ?? "Adapter call cancelled", {
        ...baseContext(),
        fields
      });
    }
  };
}

exports.HadeError = HadeError;
exports.createHadeErrorFactory = createHadeErrorFactory;
exports.isHadeError = isHadeError;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map