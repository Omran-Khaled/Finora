import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { InMemoryStore } from "./store";
import { RequestIdMiddleware } from "./request-id.middleware";
import { PrismaAuthRepository } from "../auth/auth.repository";

@Global()
@Module({
  providers: [InMemoryStore, PrismaAuthRepository],
  exports: [InMemoryStore, PrismaAuthRepository],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
