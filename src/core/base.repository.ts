export class BaseRepository<T> {
  protected model: any;

  constructor(model: any) {
    this.model = model;
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany();
  }

  async findById(id: number): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async paginate(page = 1, limit = 10, where = {}) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.findMany({ skip, take: limit, where }),
      this.model.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: number, data: Partial<T>): Promise<T> {
    return this.model.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<T> {
    return this.model.delete({ where: { id } });
  }

  async count(where?: any): Promise<number> {
    return this.model.count({ where });
  }

  async exists(where: any): Promise<boolean> {
    const count = await this.model.count({ where });
    return count > 0;
  }
}

// export class BaseRepository<T> {
//   protected model: any;

//   constructor(model: any) {
//     this.model = model;
//   }

//   async findAll(args?: any): Promise<T[]> {
//     return this.model.findMany(args);
//   }

//   async findById(id: number, args?: any): Promise<T | null> {
//     return this.model.findUnique({
//       where: { id },
//       ...args,
//     });
//   }

//   async findOne(where: any, args?: any): Promise<T | null> {
//     return this.model.findFirst({
//       where,
//       ...args,
//     });
//   }

//   async create(data: Partial<T>): Promise<T> {
//     return this.model.create({ data });
//   }

//   async createMany(data: Partial<T>[]): Promise<any> {
//     return this.model.createMany({ data });
//   }

//   async update(id: number, data: Partial<T>): Promise<T> {
//     return this.model.update({
//       where: { id },
//       data,
//     });
//   }

//   async updateMany(where: any, data: Partial<T>): Promise<any> {
//     return this.model.updateMany({
//       where,
//       data,
//     });
//   }

//   async delete(id: number): Promise<T> {
//     return this.model.delete({
//       where: { id },
//     });
//   }

//   async deleteMany(where: any): Promise<any> {
//     return this.model.deleteMany({
//       where,
//     });
//   }

//   async count(where?: any): Promise<number> {
//     return this.model.count({ where });
//   }

//   async exists(where: any): Promise<boolean> {
//     const count = await this.model.count({ where });
//     return count > 0;
//   }
// }
