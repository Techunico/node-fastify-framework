// export class StreamService {
//   constructor(private app: FastifyInstance) {}

//   async streamToUser(
//     userId: string,
//     event: string,
//     generator: AsyncGenerator<string>
//   ) {
//     for await (const chunk of generator) {
//       this.app.realtime.emitToUser(userId, event, {
//         type: 'chunk',
//         data: chunk,
//       });
//     }

//     this.app.realtime.emitToUser(userId, event, {
//       type: 'end',
//     });
//   }
// }