# Print whether the same production images can serve the target web release.
require "open3"
require "yaml"

def git(*args)
  output, status = Open3.capture2("git", *args)
  abort "Could not read server build inputs from Git" unless status.success?
  output
end

def inputs(revision)
  abort "Invalid server revision" unless /\A[0-9a-f]{40}\z/.match?(revision)
  workflow = YAML.safe_load(git("show", "#{revision}:.github/workflows/validation.yml"))
  job = workflow.fetch("jobs").fetch("publish-server")
  builds = %w[spring ai].map do |id|
    step = job.fetch("steps").find { |candidate| candidate["id"] == id }
    abort "Missing image build step: #{id}" unless step
    options = step.fetch("with")
    context = options.fetch("context")
    tree = git("rev-parse", "--verify", "#{revision}:#{context}").strip
    [tree, step.fetch("uses"), options, step["env"]]
  end
  builder = job.fetch("steps").find { |step| step.fetch("uses", "").start_with?("docker/setup-buildx-action@") }
  abort "Missing Docker builder" unless builder
  publisher = git("rev-parse", "--verify", "#{revision}:deploy/publish-server-release.sh").strip
  [builds, builder.values_at("uses", "with", "env"), workflow["env"], job["env"], publisher]
end

abort "Expected published and target revisions" unless ARGV.length == 2
puts(inputs(ARGV[0]) == inputs(ARGV[1]) ? "reuse" : "build")
