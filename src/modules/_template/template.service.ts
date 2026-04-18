import { PrismaClient } from "../../generated/prisma";
import { CreateTemplateInput } from "./template.schema";
import { AppError } from "@/utils/app-error";
import { RequestContext } from "@/types/request-context";

export class TemplateService {
  constructor(
    private readonly prisma: PrismaClient,
    private ctx?: RequestContext,
  ) {
    void this.prisma;
    void this.ctx;
  }

  async create(data: CreateTemplateInput) {
    void data;

    // ❗ No dummy return
    // This will be implemented with DB in next phase

    throw new Error("Not implemented: connect DB layer");
  }

  async findAll() {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  }
}
