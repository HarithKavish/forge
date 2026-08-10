/**
 * Deep-link construction.
 *
 * In the real product this is `ProviderAdapter.getManagementUrl()` — a pure URL
 * template rather than an API call, which is why the inventory can render a
 * link for every row without touching the provider.
 *
 * These templates are the genuine console paths. They are shown to the user
 * but not followed, because the demo's resource ids belong to accounts Forge is
 * not connected to; the interstitial at /resources/[id]/open explains that
 * rather than dropping someone on a 404.
 */

import type { ConnectedAccount, Resource } from "@/lib/data/types";

export function managementUrlFor(
  resource: Resource,
  account?: ConnectedAccount,
): string | undefined {
  const region = resource.region ?? account?.region ?? "us-east-1";
  const id = resource.providerResourceId;

  switch (resource.resourceType) {
    case "github.repository":
      return `https://github.com/${id}`;

    case "aws.ec2.instance":
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${id}`;
    case "aws.ebs.volume":
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#VolumeDetails:volumeId=${id}`;
    case "aws.ec2.elastic_ip":
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#ElasticIpDetails:AllocationId=${id}`;
    case "aws.ec2.security_group":
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#SecurityGroup:groupId=${id}`;
    case "aws.s3.bucket":
      return `https://s3.console.aws.amazon.com/s3/buckets/${id}?region=${region}`;
    case "aws.rds.instance":
      return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${id}`;
    case "aws.lambda.function":
      return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${id}`;
    case "aws.elb.load_balancer":
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#LoadBalancers:search=${id}`;

    case "mongodb.cluster":
      return `https://cloud.mongodb.com/v2#/clusters/detail/${id}`;

    case "cloudflare.zone":
      return `https://dash.cloudflare.com/${account?.externalAccountId ?? ""}/${resource.name}`;
    case "cloudflare.worker":
      return `https://dash.cloudflare.com/${account?.externalAccountId ?? ""}/workers/services/view/${resource.name}`;

    case "vercel.project":
      return `https://vercel.com/${account?.externalAccountId ?? "dashboard"}/${resource.name}`;

    default:
      return undefined;
  }
}
