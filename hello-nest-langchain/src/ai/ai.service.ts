import { Inject, Injectable } from '@nestjs/common';
import { CreateAiDto } from './dto/create-ai.dto';
import { UpdateAiDto } from './dto/update-ai.dto';
import { BookService } from '../book/book.service';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';

@Injectable()
export class AiService {
  private readonly chain: Runnable;
  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    private readonly bookService: BookService,
  ) {
    const prompt = PromptTemplate.fromTemplate('请回答以下问题：\n\n{query}');

    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }
  create(createAiDto: CreateAiDto) {
    return 'This action adds a new ai';
  }

  findAll() {
    this.bookService.findAll();
    return `This action returns all ai`;
  }

  findOne(id: number) {
    return `This action returns a #${id} ai`;
  }

  update(id: number, updateAiDto: UpdateAiDto) {
    return `This action updates a #${id} ai`;
  }

  remove(id: number) {
    return `This action removes a #${id} ai`;
  }

  async runChain(query: string): Promise<string> {
    return this.chain.invoke({ query });
  }

  async *streamChain(query: string): AsyncGenerator<string> {
    const stream = await this.chain.stream({ query });
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
