import { CreateTemplateInput } from "./template.schema";
import { AppError } from "@/utils/app-error";
import { RequestContext } from "@/types/request-context";

export class TemplateService {
  constructor(private ctx?: RequestContext) {
    void this.ctx;
  }

  async create(data: CreateTemplateInput) {
    void data;
    throw new Error("Not implemented: connect DB layer");
  }

  async findAll() {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  }
}