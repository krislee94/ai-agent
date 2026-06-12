class LocalHashEmbeddings {
  constructor({ dimensions = 1024 } = {}) {
    this.dimensions = dimensions;
  }

  async embedDocuments(texts) {
    return texts.map((text) => this.embedText(text));
  }

  async embedQuery(text) {
    return this.embedText(text);
  }

  embedText(text) {
    const chars = [...String(text).normalize("NFKC").toLowerCase()].filter(
      (char) => !/[\s\p{P}\p{S}]/u.test(char),
    );
    const vector = new Array(this.dimensions).fill(0);

    for (let n = 1; n <= 3; n += 1) {
      const weight = n === 1 ? 0.3 : n === 2 ? 1 : 1.4;
      for (let i = 0; i <= chars.length - n; i += 1) {
        const gram = chars.slice(i, i + n).join("");
        const hash = hashString(gram);
        const index = hash % this.dimensions;
        const sign = hash & 1 ? 1 : -1;
        vector[index] += sign * weight;
      }
    }

    const norm = Math.hypot(...vector);
    return norm === 0 ? vector : vector.map((value) => value / norm);
  }
}

class ResilientEmbeddings {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
    this.active = primary;
  }

  async embedDocuments(texts) {
    return this.call("embedDocuments", texts);
  }

  async embedQuery(text) {
    return this.call("embedQuery", text);
  }

  async call(method, input) {
    if (this.active === this.fallback) {
      return this.fallback[method](input);
    }

    try {
      return await this.primary[method](input);
    } catch (error) {
      if (!shouldUseFallback(error)) {
        throw error;
      }

      console.warn(
        `[embedding] Remote embedding is unavailable; using local demo embedding instead: ${formatError(error)}`,
      );
      this.active = this.fallback;
      return this.fallback[method](input);
    }
  }
}

function shouldUseFallback(error) {
  const status = error?.status;
  if ([404, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const code = error?.code ?? error?.error?.code ?? error?.type ?? error?.error?.type;
  const message = formatError(error);
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return true;
  }

  if (/arrearage/i.test(String(code))) {
    return true;
  }

  return (
    status === 400 &&
    /embedding|model|not found|unsupported|arrearage|overdue|access denied|good standing|timed out/i.test(
      message,
    )
  );
}

function formatError(error) {
  return error?.message ?? String(error);
}

function hashString(value) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export { LocalHashEmbeddings, ResilientEmbeddings };
