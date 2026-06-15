import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { BookModule } from '../book/book.module';

const chatModelProvider = {
  provide: 'CHAT_MODEL',
  useFactory: (configService: ConfigService) => {
    return new ChatOpenAI({
      model: configService.get('MODEL_NAME'),
      apiKey: configService.get('OPENAI_API_KEY'),
      configuration: {
        baseURL: configService.get('OPENAI_BASE_URL'),
      },
    });
  },
  inject: [ConfigService],
};

@Module({
  imports: [BookModule],
  controllers: [AiController],
  providers: [AiService, chatModelProvider],
  exports: [AiService, 'CHAT_MODEL'],
})
export class AiModule {}
