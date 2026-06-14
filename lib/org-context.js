const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function runWithOrg(slug, fn) {
  return storage.run({ slug }, fn);
}

function setOrgSlug(slug) {
  const store = storage.getStore();
  if (store) {
    store.slug = slug;
    return;
  }
  throw new Error("Organization context is not active");
}

function getOrgSlug() {
  const slug = storage.getStore()?.slug;
  if (!slug) throw new Error("No organization selected");
  return slug;
}

function getOrgSlugOrNull() {
  return storage.getStore()?.slug || null;
}

module.exports = {
  runWithOrg,
  setOrgSlug,
  getOrgSlug,
  getOrgSlugOrNull,
};
