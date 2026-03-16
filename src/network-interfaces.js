import os from "node:os";

function isPrivateIpv4(address) {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function ipToInt(ipAddress) {
  return ipAddress.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

function intToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ].join(".");
}

function calculateBroadcast(address, netmask) {
  const addressInt = ipToInt(address);
  const maskInt = ipToInt(netmask);
  const broadcastInt = (addressInt & maskInt) | (~maskInt >>> 0);
  return intToIp(broadcastInt);
}

export function listActiveLanInterfaces() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [name, candidates] of Object.entries(interfaces)) {
    for (const candidate of candidates ?? []) {
      if (candidate.family !== "IPv4" || candidate.internal) {
        continue;
      }

      if (!candidate.address || !candidate.netmask || candidate.netmask === "255.255.255.255") {
        continue;
      }

      if (!isPrivateIpv4(candidate.address)) {
        continue;
      }

      results.push({
        name,
        address: candidate.address,
        netmask: candidate.netmask,
        cidr: candidate.cidr ?? null,
        broadcast: calculateBroadcast(candidate.address, candidate.netmask)
      });
    }
  }

  return results.sort((left, right) => left.name.localeCompare(right.name));
}
