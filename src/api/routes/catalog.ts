import { Hono } from "hono";
import { body, query, requires, storeOwner, type ApiEnv } from "../middleware";
import * as catalog from "~/server/services/catalog";

type CategoryInput = { name: string; parent_id?: string | null; sort?: number | string };

export const categories = new Hono<ApiEnv>()
  .use(storeOwner, requires("products"))
  .get("/", async (c) => c.json(await catalog.listCategories(c.get("storeId"))))
  .post("/", body<CategoryInput>(), async (c) => c.json(await catalog.saveCategory(c.get("storeId"), c.req.valid("json")), 201))
  .put("/:id", body<CategoryInput>(), async (c) => c.json(await catalog.saveCategory(c.get("storeId"), { ...c.req.valid("json"), id: c.req.param("id") })))
  .delete("/:id", async (c) => c.json(await catalog.deleteCategory(c.get("storeId"), c.req.param("id"))));

type ProductQuery = { q?: string; category?: string; status?: string; stock?: string; page?: string };

export const products = new Hono<ApiEnv>()
  .use(storeOwner)
  // The manual order form needs the catalogue too, so this one opens to either feature.
  .get("/options", requires("products", "orders"), async (c) => c.json(await catalog.productOptions(c.get("storeId"))))
  .use(requires("products"))
  .get("/", query<ProductQuery>(), async (c) => {
    const f = c.req.valid("query");
    return c.json(await catalog.listProducts(c.get("storeId"), { ...f, stock: f.stock as catalog.ProductFilters["stock"], page: f.page ? Number(f.page) : undefined }));
  })
  .post("/", body<catalog.ProductInput>(), async (c) => c.json(await catalog.createProduct(c.get("storeId"), c.req.valid("json")), 201))
  .get("/:id", async (c) => c.json(await catalog.getProduct(c.get("storeId"), c.req.param("id"))))
  .put("/:id", body<catalog.ProductInput>(), async (c) => c.json(await catalog.updateProduct(c.get("storeId"), c.req.param("id"), c.req.valid("json"))))
  .delete("/:id", async (c) => c.json(await catalog.deleteProduct(c.get("storeId"), c.req.param("id"))))
  .put("/:id/status", body<{ status: string }>(), async (c) =>
    c.json(await catalog.setProductStatus(c.get("storeId"), c.req.param("id"), c.req.valid("json").status)),
  )
  .get("/:id/stock", async (c) => c.json(await catalog.stockHistory(c.get("storeId"), c.req.param("id"))))
  .post("/:id/stock", body<{ change: number | string; reason?: string; note?: string }>(), async (c) =>
    c.json(await catalog.adjustStock(c.get("storeId"), c.req.param("id"), c.req.valid("json"))),
  );
