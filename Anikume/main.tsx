import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./src/router";
import "./src/styles.css";

const router = getRouter();
if (router.routeTree?.options) {
  delete (router.routeTree.options as any).shellComponent;
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<RouterProvider router={router} />);
}
