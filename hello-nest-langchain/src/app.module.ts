import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookModule } from './book/book.module';
import { AiModule } from './ai/ai.module';

// 引入ConfigModule
import { ConfigModule } from '@nestjs/config';

//通过serve-static提供静态资源
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot({
      isGlobal: true, // 全局可用，无需在其他模块中导入
      envFilePath: ['.env'],
    }),
    BookModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
