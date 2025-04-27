    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await getRealPath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const StreamReadFileArgsSchema = z.object({
  path: z.string(),
  offset: z.number().optional().default(0),
  limit: z.number().optional(),
  encoding: z.string().optional().default('utf8'),
  chunkSize: z.number().optional().default(DEFAULT_CHUNK_SIZE),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const AppendFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const SmartAppendFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  chunkSize: z.number().optional().default(1024),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  maxDepth: z.number().optional().default(3),
  maxItems: z.number().optional().default(1000),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
  maxDepth: z.number().optional().default(5),
  maxItems: z.number().optional().default(5000),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }

  return formattedDiff;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const basicTools = [
    {
      name: "read_file",
      description:
        "Read the contents of a file from the file system. " +
        "For files larger than 1MB, only the first 1MB is returned to avoid overwhelming the LLM. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
    },
    {
      name: "stream_read_file",
      description:
        "Read large files with streaming support and precise control over reading positions. " +
        "Allows specifying offset (starting position), limit (maximum bytes to read), " +
        "and encoding. Perfect for processing large files in manageable chunks " +
        "or extracting specific portions of large files without loading the entire file. " +
        "Use this tool when standard read_file fails due to file size limitations " +
        "or when you need to read specific parts of a file. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(StreamReadFileArgsSchema) as ToolInput,
    },
    {
      name: "write_file",
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
    },
    {
      name: "append_file",
      description:
        "Append content to the end of an existing file or create a new file if it doesn't exist. " +
        "This is safer than write_file when you want to add content without overwriting existing data. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(AppendFileArgsSchema) as ToolInput,
    },
    {
      name: "smart_append_file",
      description:
        "Intelligently append content to a file without duplication, even if previous append was interrupted. " +
        "Detects overlapping content between existing file end and new content beginning. " +
        "Only appends the non-overlapping content to avoid duplication. " +
        "Perfect for resilient logging and incremental data collection. " +
        "Only works within allowed directories.",
      inputSchema: zodToJsonSchema(SmartAppendFileArgsSchema) as ToolInput,
    },
    {
      name: "list_directory",
      description:
        "Get a detailed listing of all files and directories in a specified path. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is essential for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
    },
    {
      name: "create_directory",
      description:
        "Create a new directory or ensure a directory exists. Can create multiple " +
        "nested directories in one operation. If the directory already exists, " +
        "this operation will succeed silently. Perfect for setting up directory " +
        "structures for projects or ensuring required paths exist. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
    },
    {
      name: "get_file_info",
      description:
        "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
        "information including size, creation time, last modified time, permissions, " +
        "and type. This tool is perfect for understanding file characteristics " +
        "without reading the actual content. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
    },
    {
      name: "list_allowed_directories",
      description:
        "Returns the list of directories that this server is allowed to access. " +
        "Use this to understand which directories are available before trying to access files.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];

  const advancedTools = [
    {
      name: "read_multiple_files",
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. For files larger than 1MB, only the first 1MB is returned. " +
        "Each file's content is returned with its path as a reference. Failed reads for " +
        "individual files won't stop the entire operation. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
    },
    {
      name: "edit_file",
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
    },
    {
      name: "directory_tree",
      description:
          "Get a recursive tree view of files and directories as a JSON structure. " +
          "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
          "Files have no children array, while directories always have a children array (which may be empty). " +
          "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
    },
    {
      name: "move_file",
      description:
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
    },
    {
      name: "search_files",
      description:
        "Recursively search for files and directories matching a pattern. " +
        "Searches through all subdirectories from the starting path. The search " +
        "is case-insensitive and matches partial names. Returns full paths to all " +
        "matching items. Great for finding files when you don't know their exact location. " +
        "Only searches within allowed directories.",
      inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
    },
  ];

  const allTools = [...basicTools, ...advancedTools];
  return {
    tools: allTools
  };
});
