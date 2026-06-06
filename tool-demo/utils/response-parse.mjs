const PATCHED = Symbol.for("tool-demo.patchMissingResponseAnnotations");

const normalizeOutputTextAnnotations = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeOutputTextAnnotations(item);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (value.type === "output_text") {
    value.annotations ??= [];
  }

  for (const childValue of Object.values(value)) {
    normalizeOutputTextAnnotations(childValue);
  }
};

function patchResponsesModel(responsesModel) {
  if (!responsesModel || responsesModel[PATCHED]) {
    return;
  }

  const originalCompletionWithRetry =
    responsesModel.completionWithRetry.bind(responsesModel);

  responsesModel.completionWithRetry = async (...args) => {
    const response = await originalCompletionWithRetry(...args);
    normalizeOutputTextAnnotations(response);
    return response;
  };

  responsesModel[PATCHED] = true;
}

function patchMissingResponseAnnotations(chatModel) {
  patchResponsesModel(chatModel.responses);

  const originalWithConfig = chatModel.withConfig?.bind(chatModel);
  if (originalWithConfig && !chatModel.withConfig[PATCHED]) {
    chatModel.withConfig = (...args) => {
      const nextModel = originalWithConfig(...args);
      patchMissingResponseAnnotations(nextModel);
      return nextModel;
    };
    chatModel.withConfig[PATCHED] = true;
  }

  const originalBindTools = chatModel.bindTools?.bind(chatModel);
  if (originalBindTools && !chatModel.bindTools[PATCHED]) {
    chatModel.bindTools = (...args) => {
      const nextModel = originalBindTools(...args);
      patchMissingResponseAnnotations(nextModel);
      return nextModel;
    };
    chatModel.bindTools[PATCHED] = true;
  }
}

export { patchMissingResponseAnnotations };
